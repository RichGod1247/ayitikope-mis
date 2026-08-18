import type {
  NativeDocumentExtension,
  NativeDocumentOleLimits,
  NativeDocumentOleStructuralEvidence,
  NativeDocumentScannerReasonCode,
} from "./types";

const CFB_SIGNATURE = Buffer.from([
  0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
]);

const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const FATSECT = 0xfffffffd;
const DIFSECT = 0xfffffffc;
const MAXREGSECT = 0xfffffffa;
const NOSTREAM = 0xffffffff;
const MINI_STREAM_CUTOFF = 4096;
const MINI_SECTOR_SIZE = 64;

type OleFailure = {
  ok: false;
  verdict: "BLOCKED" | "FAILED";
  reasonCode: NativeDocumentScannerReasonCode;
  message: string;
};

type OleSuccess = {
  ok: true;
  format: "WORD_BINARY" | "EXCEL_BINARY" | "POWERPOINT_BINARY";
  evidence: NativeDocumentOleStructuralEvidence;
};

export type OleStructuralInspectionResult = OleFailure | OleSuccess;

type DirectoryEntry = {
  id: number;
  name: string;
  objectType: 0 | 1 | 2 | 5;
  leftSiblingId: number;
  rightSiblingId: number;
  childId: number;
  startSector: number;
  streamSize: number;
  parentId: number | null;
  path: string | null;
};

type ParsedHeader = {
  majorVersion: 3 | 4;
  sectorSize: 512 | 4096;
  sectorCount: number;
  numberOfDirectorySectors: number;
  numberOfFatSectors: number;
  firstDirectorySector: number;
  firstMiniFatSector: number;
  numberOfMiniFatSectors: number;
  firstDifatSector: number;
  numberOfDifatSectors: number;
  headerDifat: number[];
};

type OleContext = {
  bytes: Buffer;
  limits: NativeDocumentOleLimits;
  header: ParsedHeader;
  fat: number[];
  sectorOwners: Map<number, string>;
};

function failure(
  reasonCode: NativeDocumentScannerReasonCode,
  message: string,
  verdict: "BLOCKED" | "FAILED" = "FAILED",
): OleFailure {
  return { ok: false, verdict, reasonCode, message };
}

function isPositiveSafeInteger(value: unknown) {
  const numeric = Number(value);
  return Number.isSafeInteger(numeric) && numeric > 0;
}

function validateLimits(limits: NativeDocumentOleLimits) {
  return (
    isPositiveSafeInteger(limits.maxDirectoryEntries) &&
    isPositiveSafeInteger(limits.maxDirectoryDepth) &&
    isPositiveSafeInteger(limits.maxFatSectors) &&
    isPositiveSafeInteger(limits.maxDifatSectors) &&
    isPositiveSafeInteger(limits.maxMiniFatSectors) &&
    isPositiveSafeInteger(limits.maxSectorChainLength) &&
    isPositiveSafeInteger(limits.maxStreams) &&
    isPositiveSafeInteger(limits.maxStreamBytes) &&
    isPositiveSafeInteger(limits.maxTotalStreamBytes)
  );
}

function sectorFileOffset(sectorId: number, sectorSize: number) {
  return (sectorId + 1) * sectorSize;
}

function validRegularSectorId(sectorId: number, sectorCount: number) {
  return (
    Number.isInteger(sectorId) &&
    sectorId >= 0 &&
    sectorId < sectorCount &&
    sectorId < MAXREGSECT
  );
}

function readSector(
  bytes: Buffer,
  sectorId: number,
  sectorSize: number,
  sectorCount: number,
) {
  if (!validRegularSectorId(sectorId, sectorCount)) return null;
  const offset = sectorFileOffset(sectorId, sectorSize);
  const end = offset + sectorSize;
  if (offset < sectorSize || end > bytes.length) return null;
  return bytes.subarray(offset, end);
}

function claimSector(
  owners: Map<number, string>,
  sectorId: number,
  owner: string,
): OleFailure | null {
  const previous = owners.get(sectorId);
  if (previous && previous !== owner) {
    return failure(
      "OLE_SECTOR_OWNERSHIP_CONFLICT",
      "A compound-file sector is referenced by more than one structural owner.",
    );
  }
  owners.set(sectorId, owner);
  return null;
}

function parseHeader(bytes: Buffer, limits: NativeDocumentOleLimits): ParsedHeader | OleFailure {
  if (bytes.length < 512 || !bytes.subarray(0, 8).equals(CFB_SIGNATURE)) {
    return failure("OLE_HEADER_INVALID", "The compound-file header signature is invalid.");
  }

  for (let index = 8; index < 24; index += 1) {
    if (bytes[index] !== 0) {
      return failure("OLE_HEADER_INVALID", "The compound-file header CLSID is invalid.");
    }
  }

  const majorVersion = bytes.readUInt16LE(26);
  const byteOrder = bytes.readUInt16LE(28);
  const sectorShift = bytes.readUInt16LE(30);
  const miniSectorShift = bytes.readUInt16LE(32);

  if (majorVersion !== 3 && majorVersion !== 4) {
    return failure("OLE_VERSION_UNSUPPORTED", "The compound-file major version is unsupported.");
  }
  if (byteOrder !== 0xfffe) {
    return failure("OLE_HEADER_INVALID", "The compound-file byte order marker is invalid.");
  }

  const sectorSize = majorVersion === 3 ? 512 : 4096;
  if (
    sectorShift !== (majorVersion === 3 ? 9 : 12) ||
    miniSectorShift !== 6 ||
    bytes.readUInt32LE(56) !== MINI_STREAM_CUTOFF
  ) {
    return failure("OLE_SECTOR_GEOMETRY_INVALID", "The compound-file sector geometry is invalid.");
  }

  for (let index = 34; index < 40; index += 1) {
    if (bytes[index] !== 0) {
      return failure("OLE_HEADER_INVALID", "Reserved compound-file header bytes are non-zero.");
    }
  }

  if (bytes.length < sectorSize || bytes.length % sectorSize !== 0) {
    return failure("OLE_SECTOR_GEOMETRY_INVALID", "The compound-file length is not sector aligned.");
  }

  if (majorVersion === 4) {
    for (let index = 512; index < sectorSize; index += 1) {
      if (bytes[index] !== 0) {
        return failure("OLE_HEADER_INVALID", "Version 4 compound-file header padding is invalid.");
      }
    }
  }

  const numberOfDirectorySectors = bytes.readUInt32LE(40);
  if (majorVersion === 3 && numberOfDirectorySectors !== 0) {
    return failure("OLE_HEADER_INVALID", "Version 3 compound files cannot declare directory-sector counts.");
  }

  const numberOfFatSectors = bytes.readUInt32LE(44);
  const firstDirectorySector = bytes.readUInt32LE(48);
  const firstMiniFatSector = bytes.readUInt32LE(60);
  const numberOfMiniFatSectors = bytes.readUInt32LE(64);
  const firstDifatSector = bytes.readUInt32LE(68);
  const numberOfDifatSectors = bytes.readUInt32LE(72);

  if (numberOfFatSectors > limits.maxFatSectors) {
    return failure("OLE_FAT_LIMIT_EXCEEDED", "The compound file declares too many FAT sectors.");
  }
  if (numberOfDifatSectors > limits.maxDifatSectors) {
    return failure("OLE_DIFAT_LIMIT_EXCEEDED", "The compound file declares too many DIFAT sectors.");
  }
  if (numberOfMiniFatSectors > limits.maxMiniFatSectors) {
    return failure("OLE_MINIFAT_LIMIT_EXCEEDED", "The compound file declares too many MiniFAT sectors.");
  }

  const headerDifat: number[] = [];
  for (let index = 0; index < 109; index += 1) {
    headerDifat.push(bytes.readUInt32LE(76 + index * 4));
  }

  return {
    majorVersion,
    sectorSize,
    sectorCount: bytes.length / sectorSize - 1,
    numberOfDirectorySectors,
    numberOfFatSectors,
    firstDirectorySector,
    firstMiniFatSector,
    numberOfMiniFatSectors,
    firstDifatSector,
    numberOfDifatSectors,
    headerDifat,
  };
}

function buildFat(
  bytes: Buffer,
  header: ParsedHeader,
  limits: NativeDocumentOleLimits,
  owners: Map<number, string>,
): number[] | OleFailure {
  const fatSectorIds: number[] = [];
  const fatSectorSet = new Set<number>();

  const addFatSector = (sectorId: number): OleFailure | null => {
    if (sectorId === FREESECT) return null;
    if (!validRegularSectorId(sectorId, header.sectorCount)) {
      return failure("OLE_DIFAT_INVALID", "The DIFAT references an invalid FAT sector.");
    }
    if (fatSectorSet.has(sectorId)) {
      return failure("OLE_DIFAT_INVALID", "The DIFAT contains a duplicate FAT sector reference.");
    }
    fatSectorSet.add(sectorId);
    fatSectorIds.push(sectorId);
    return null;
  };

  for (const sectorId of header.headerDifat) {
    const problem = addFatSector(sectorId);
    if (problem) return problem;
  }

  let nextDifat = header.firstDifatSector;
  const seenDifat = new Set<number>();
  const entriesPerDifatSector = header.sectorSize / 4 - 1;

  for (let count = 0; count < header.numberOfDifatSectors; count += 1) {
    if (!validRegularSectorId(nextDifat, header.sectorCount) || seenDifat.has(nextDifat)) {
      return failure("OLE_DIFAT_INVALID", "The DIFAT sector chain is invalid or cyclic.");
    }
    seenDifat.add(nextDifat);
    const claim = claimSector(owners, nextDifat, "DIFAT");
    if (claim) return claim;

    const sector = readSector(bytes, nextDifat, header.sectorSize, header.sectorCount);
    if (!sector) return failure("OLE_DIFAT_INVALID", "A DIFAT sector cannot be read safely.");

    for (let index = 0; index < entriesPerDifatSector; index += 1) {
      const problem = addFatSector(sector.readUInt32LE(index * 4));
      if (problem) return problem;
    }
    nextDifat = sector.readUInt32LE(entriesPerDifatSector * 4);
  }

  if (
    header.numberOfDifatSectors === 0
      ? header.firstDifatSector !== ENDOFCHAIN && header.firstDifatSector !== FREESECT
      : nextDifat !== ENDOFCHAIN
  ) {
    return failure("OLE_DIFAT_INVALID", "The DIFAT chain termination does not match the header.");
  }

  if (fatSectorIds.length !== header.numberOfFatSectors) {
    return failure("OLE_DIFAT_INVALID", "The DIFAT FAT-sector count does not match the header.");
  }
  if (fatSectorIds.length > limits.maxFatSectors) {
    return failure("OLE_FAT_LIMIT_EXCEEDED", "The compound file exceeds the FAT-sector limit.");
  }

  for (const sectorId of fatSectorIds) {
    const claim = claimSector(owners, sectorId, "FAT");
    if (claim) return claim;
  }

  const fat: number[] = [];
  for (const sectorId of fatSectorIds) {
    const sector = readSector(bytes, sectorId, header.sectorSize, header.sectorCount);
    if (!sector) return failure("OLE_FAT_INVALID", "A FAT sector cannot be read safely.");
    for (let offset = 0; offset < sector.length; offset += 4) {
      fat.push(sector.readUInt32LE(offset));
    }
  }

  for (const sectorId of fatSectorIds) {
    if (sectorId >= fat.length || fat[sectorId] !== FATSECT) {
      return failure("OLE_FAT_INVALID", "A FAT sector is not marked as FAT-owned in the FAT.");
    }
  }
  for (const sectorId of seenDifat) {
    if (sectorId >= fat.length || fat[sectorId] !== DIFSECT) {
      return failure("OLE_DIFAT_INVALID", "A DIFAT sector is not marked as DIFAT-owned in the FAT.");
    }
  }

  return fat;
}

function readFatChain(args: {
  context: OleContext;
  startSector: number;
  owner: string;
  expectedSectors?: number;
}): number[] | OleFailure {
  const { context } = args;
  if (args.startSector === ENDOFCHAIN) {
    if ((args.expectedSectors ?? 0) === 0) return [];
    return failure("OLE_STREAM_CHAIN_INVALID", "A required sector chain is empty.");
  }

  const chain: number[] = [];
  const seen = new Set<number>();
  let sectorId = args.startSector;

  while (sectorId !== ENDOFCHAIN) {
    if (chain.length >= context.limits.maxSectorChainLength) {
      return failure("OLE_SECTOR_CHAIN_LIMIT_EXCEEDED", "A compound-file sector chain exceeds the configured limit.");
    }
    if (!validRegularSectorId(sectorId, context.header.sectorCount)) {
      return failure("OLE_STREAM_CHAIN_INVALID", "A compound-file sector chain references an invalid sector.");
    }
    if (seen.has(sectorId)) {
      return failure("OLE_SECTOR_CHAIN_LOOP", "A compound-file sector chain contains a cycle.");
    }
    seen.add(sectorId);

    const claim = claimSector(context.sectorOwners, sectorId, args.owner);
    if (claim) return claim;
    chain.push(sectorId);

    if (sectorId >= context.fat.length) {
      return failure("OLE_FAT_INVALID", "A sector chain extends beyond the available FAT entries.");
    }
    const next = context.fat[sectorId];
    if (next === FREESECT || next === FATSECT || next === DIFSECT || next === undefined) {
      return failure("OLE_STREAM_CHAIN_INVALID", "A compound-file sector chain contains an invalid FAT marker.");
    }
    sectorId = next;
  }

  if (args.expectedSectors !== undefined && chain.length !== args.expectedSectors) {
    return failure("OLE_STREAM_CHAIN_INVALID", "A compound-file sector chain length does not match its declared size.");
  }
  return chain;
}

function chainBytes(context: OleContext, chain: number[]) {
  const chunks: Buffer[] = [];
  for (const sectorId of chain) {
    const sector = readSector(
      context.bytes,
      sectorId,
      context.header.sectorSize,
      context.header.sectorCount,
    );
    if (!sector) return null;
    chunks.push(sector);
  }
  return Buffer.concat(chunks);
}

function parseStreamSize(entryBytes: Buffer) {
  const low = entryBytes.readUInt32LE(120);
  const high = entryBytes.readUInt32LE(124);
  const value = high * 0x100000000 + low;
  return Number.isSafeInteger(value) ? value : null;
}

function parseDirectory(context: OleContext): DirectoryEntry[] | OleFailure {
  const directoryChain = readFatChain({
    context,
    startSector: context.header.firstDirectorySector,
    owner: "DIRECTORY",
    expectedSectors:
      context.header.majorVersion === 4
        ? context.header.numberOfDirectorySectors
        : undefined,
  });
  if (!Array.isArray(directoryChain)) return directoryChain;

  const bytes = chainBytes(context, directoryChain);
  if (!bytes || bytes.length % 128 !== 0) {
    return failure("OLE_DIRECTORY_INVALID", "The compound-file directory stream is malformed.");
  }

  const slotCount = bytes.length / 128;
  if (slotCount > context.limits.maxDirectoryEntries) {
    return failure("OLE_DIRECTORY_ENTRY_LIMIT_EXCEEDED", "The compound-file directory exceeds the configured entry limit.");
  }

  const entries: DirectoryEntry[] = [];
  for (let id = 0; id < slotCount; id += 1) {
    const entryBytes = bytes.subarray(id * 128, id * 128 + 128);
    const objectType = entryBytes[66] as 0 | 1 | 2 | 5;
    if (![0, 1, 2, 5].includes(objectType)) {
      return failure("OLE_DIRECTORY_INVALID", "A compound-file directory entry has an invalid object type.");
    }

    let name = "";
    if (objectType !== 0) {
      const nameLength = entryBytes.readUInt16LE(64);
      if (nameLength < 2 || nameLength > 64 || nameLength % 2 !== 0) {
        return failure("OLE_DIRECTORY_INVALID", "A compound-file directory name length is invalid.");
      }
      if (entryBytes[nameLength - 2] !== 0 || entryBytes[nameLength - 1] !== 0) {
        return failure("OLE_DIRECTORY_INVALID", "A compound-file directory name is not null terminated.");
      }
      name = entryBytes.subarray(0, nameLength - 2).toString("utf16le");
      if (!name || /[\u0000]/.test(name)) {
        return failure("OLE_DIRECTORY_INVALID", "A compound-file directory name is invalid.");
      }
      if (/[\/\\:!]/u.test(name)) {
        return failure(
          "OLE_DIRECTORY_INVALID",
          "A compound-file directory name contains a prohibited character.",
        );
      }
    }

    const colorFlag = entryBytes[67];
    if (colorFlag !== 0 && colorFlag !== 1) {
      return failure(
        "OLE_DIRECTORY_INVALID",
        "A compound-file directory entry has an invalid color flag.",
      );
    }

    const streamSize = parseStreamSize(entryBytes);
    if (streamSize === null) {
      return failure("OLE_STREAM_SIZE_LIMIT_EXCEEDED", "A compound-file stream size cannot be represented safely.");
    }

    entries.push({
      id,
      name,
      objectType,
      leftSiblingId: entryBytes.readUInt32LE(68),
      rightSiblingId: entryBytes.readUInt32LE(72),
      childId: entryBytes.readUInt32LE(76),
      startSector: entryBytes.readUInt32LE(116),
      streamSize,
      parentId: null,
      path: null,
    });
  }

  if (
    entries.length === 0 ||
    entries[0]?.objectType !== 5 ||
    entries[0]?.name !== "Root Entry"
  ) {
    return failure("OLE_DIRECTORY_INVALID", "The compound file does not begin with a valid Root Entry storage.");
  }
  if (entries.slice(1).some((entry) => entry.objectType === 5)) {
    return failure("OLE_DIRECTORY_INVALID", "The compound file contains more than one root storage entry.");
  }

  const root = entries[0] as DirectoryEntry;
  if (root.leftSiblingId !== NOSTREAM || root.rightSiblingId !== NOSTREAM) {
    return failure("OLE_DIRECTORY_TREE_INVALID", "The root storage has invalid sibling references.");
  }
  for (const entry of entries.slice(1)) {
    if (entry.objectType === 1 && (entry.startSector !== 0 || entry.streamSize !== 0)) {
      return failure("OLE_DIRECTORY_INVALID", "A storage directory entry has invalid stream allocation fields.");
    }
  }
  root.path = root.name;
  const visited = new Set<number>();

  const validEntryReference = (id: number) => id === NOSTREAM || (id > 0 && id < entries.length);
  for (const entry of entries) {
    if (entry.objectType === 0) continue;
    if (
      !validEntryReference(entry.leftSiblingId) ||
      !validEntryReference(entry.rightSiblingId) ||
      !validEntryReference(entry.childId)
    ) {
      return failure("OLE_DIRECTORY_TREE_INVALID", "A compound-file directory pointer is out of range.");
    }
  }

  const walkSiblingTree = (
    nodeId: number,
    parentId: number,
    depth: number,
    localSeen: Set<number>,
    siblingNames: Set<string>,
  ): OleFailure | null => {
    if (nodeId === NOSTREAM) return null;
    if (depth > context.limits.maxDirectoryDepth) {
      return failure("OLE_DIRECTORY_DEPTH_LIMIT_EXCEEDED", "The compound-file directory hierarchy is too deep.");
    }
    if (localSeen.has(nodeId) || visited.has(nodeId)) {
      return failure("OLE_DIRECTORY_TREE_INVALID", "The compound-file directory tree contains a cycle or duplicate parentage.");
    }
    localSeen.add(nodeId);

    const node = entries[nodeId];
    if (!node || node.objectType === 0 || node.objectType === 5) {
      return failure("OLE_DIRECTORY_TREE_INVALID", "The compound-file directory tree references an invalid entry.");
    }

    const leftProblem = walkSiblingTree(
      node.leftSiblingId,
      parentId,
      depth,
      localSeen,
      siblingNames,
    );
    if (leftProblem) return leftProblem;

    if (visited.has(nodeId)) {
      return failure("OLE_DIRECTORY_TREE_INVALID", "A compound-file directory entry has multiple parents.");
    }
    visited.add(nodeId);
    node.parentId = parentId;
    const parent = entries[parentId] as DirectoryEntry;
    node.path = `${parent.path ?? parent.name}/${node.name}`;

    const normalizedName = node.name.toLocaleLowerCase("en-US");
    if (siblingNames.has(normalizedName)) {
      return failure("OLE_DIRECTORY_TREE_INVALID", "A compound-file storage contains duplicate child names.");
    }
    siblingNames.add(normalizedName);

    if (node.objectType === 2 && node.childId !== NOSTREAM) {
      return failure("OLE_DIRECTORY_TREE_INVALID", "A compound-file stream entry cannot contain children.");
    }

    if (node.objectType === 1) {
      const childProblem = walkSiblingTree(
        node.childId,
        node.id,
        depth + 1,
        new Set<number>(),
        new Set<string>(),
      );
      if (childProblem) return childProblem;
    }

    const rightProblem = walkSiblingTree(
      node.rightSiblingId,
      parentId,
      depth,
      localSeen,
      siblingNames,
    );
    if (rightProblem) return rightProblem;

    return null;
  };

  const treeProblem = walkSiblingTree(
    root.childId,
    0,
    1,
    new Set<number>(),
    new Set<string>(),
  );
  if (treeProblem) return treeProblem;

  for (const entry of entries) {
    if (entry.id !== 0 && entry.objectType !== 0 && !visited.has(entry.id)) {
      return failure("OLE_DIRECTORY_TREE_INVALID", "The compound file contains an unreachable directory entry.");
    }
  }

  return entries;
}

function readMiniFat(context: OleContext): number[] | OleFailure {
  const count = context.header.numberOfMiniFatSectors;
  if (count === 0) {
    if (
      context.header.firstMiniFatSector !== ENDOFCHAIN &&
      context.header.firstMiniFatSector !== FREESECT
    ) {
      return failure("OLE_MINIFAT_INVALID", "The MiniFAT header is inconsistent with an empty MiniFAT.");
    }
    return [];
  }

  const chain = readFatChain({
    context,
    startSector: context.header.firstMiniFatSector,
    owner: "MINIFAT",
    expectedSectors: count,
  });
  if (!Array.isArray(chain)) return chain;
  if (chain.length > context.limits.maxMiniFatSectors) {
    return failure("OLE_MINIFAT_LIMIT_EXCEEDED", "The MiniFAT sector count exceeds the configured limit.");
  }

  const bytes = chainBytes(context, chain);
  if (!bytes) return failure("OLE_MINIFAT_INVALID", "The MiniFAT cannot be read safely.");
  const miniFat: number[] = [];
  for (let offset = 0; offset < bytes.length; offset += 4) {
    miniFat.push(bytes.readUInt32LE(offset));
  }
  return miniFat;
}

function readRegularStream(
  context: OleContext,
  entry: DirectoryEntry,
  owner: string,
): Buffer | OleFailure {
  if (entry.streamSize === 0) return Buffer.alloc(0);
  const expectedSectors = Math.ceil(entry.streamSize / context.header.sectorSize);
  const chain = readFatChain({
    context,
    startSector: entry.startSector,
    owner,
    expectedSectors,
  });
  if (!Array.isArray(chain)) return chain;
  const bytes = chainBytes(context, chain);
  if (!bytes || bytes.length < entry.streamSize) {
    return failure("OLE_STREAM_CHAIN_INVALID", "A regular compound-file stream is truncated.");
  }
  return bytes.subarray(0, entry.streamSize);
}

function readMiniStream(args: {
  entry: DirectoryEntry;
  miniFat: number[];
  rootMiniStream: Buffer;
  miniOwners: Map<number, number>;
  limits: NativeDocumentOleLimits;
}): Buffer | OleFailure {
  if (args.entry.streamSize === 0) return Buffer.alloc(0);
  const expectedSectors = Math.ceil(args.entry.streamSize / MINI_SECTOR_SIZE);
  const chunks: Buffer[] = [];
  const seen = new Set<number>();
  let miniSectorId = args.entry.startSector;

  for (let count = 0; count < expectedSectors; count += 1) {
    if (count >= args.limits.maxSectorChainLength) {
      return failure("OLE_SECTOR_CHAIN_LIMIT_EXCEEDED", "A mini-sector chain exceeds the configured limit.");
    }
    if (
      !Number.isInteger(miniSectorId) ||
      miniSectorId < 0 ||
      miniSectorId >= args.miniFat.length ||
      miniSectorId >= MAXREGSECT
    ) {
      return failure("OLE_MINISTREAM_INVALID", "A mini-sector chain references an invalid MiniFAT entry.");
    }
    if (seen.has(miniSectorId)) {
      return failure("OLE_SECTOR_CHAIN_LOOP", "A mini-sector chain contains a cycle.");
    }
    seen.add(miniSectorId);

    const previousOwner = args.miniOwners.get(miniSectorId);
    if (previousOwner !== undefined && previousOwner !== args.entry.id) {
      return failure("OLE_SECTOR_OWNERSHIP_CONFLICT", "A mini sector is shared by multiple streams.");
    }
    args.miniOwners.set(miniSectorId, args.entry.id);

    const offset = miniSectorId * MINI_SECTOR_SIZE;
    const end = offset + MINI_SECTOR_SIZE;
    if (end > args.rootMiniStream.length) {
      return failure("OLE_MINISTREAM_INVALID", "A mini-sector chain extends beyond the root mini stream.");
    }
    chunks.push(args.rootMiniStream.subarray(offset, end));

    const next = args.miniFat[miniSectorId];
    if (next === undefined) {
      return failure("OLE_MINIFAT_INVALID", "A mini-sector chain extends beyond the MiniFAT.");
    }
    miniSectorId = next;
  }

  if (miniSectorId !== ENDOFCHAIN) {
    return failure("OLE_STREAM_CHAIN_INVALID", "A mini-sector chain contains more sectors than its declared stream size.");
  }

  return Buffer.concat(chunks).subarray(0, args.entry.streamSize);
}

function normalizedName(name: string) {
  return name.toLocaleLowerCase("en-US");
}

function applicationFormat(args: {
  declaredExtension: Extract<NativeDocumentExtension, "doc" | "xls" | "ppt">;
  rootStreams: DirectoryEntry[];
}): "WORD_BINARY" | "EXCEL_BINARY" | "POWERPOINT_BINARY" | OleFailure {
  const names = new Set(args.rootStreams.map((entry) => normalizedName(entry.name)));
  const hasWord = names.has("worddocument");
  const hasExcel = names.has("workbook") || names.has("book");
  const hasPowerPoint = names.has("powerpoint document");

  const familyCount = [hasWord, hasExcel, hasPowerPoint].filter(Boolean).length;
  if (familyCount > 1) {
    return failure(
      "OLE_APPLICATION_MISMATCH",
      "The compound file exposes conflicting legacy Office application streams.",
      "BLOCKED",
    );
  }

  const expected =
    args.declaredExtension === "doc"
      ? hasWord
      : args.declaredExtension === "xls"
        ? hasExcel
        : hasPowerPoint;

  if (!expected) {
    if (hasWord || hasExcel || hasPowerPoint) {
      return failure(
        "OLE_APPLICATION_MISMATCH",
        "The compound-file application stream contradicts the declared legacy Office extension.",
        "BLOCKED",
      );
    }
    return failure(
      "OLE_APPLICATION_STREAM_MISSING",
      "The expected legacy Office application stream is missing from the compound file.",
    );
  }

  return args.declaredExtension === "doc"
    ? "WORD_BINARY"
    : args.declaredExtension === "xls"
      ? "EXCEL_BINARY"
      : "POWERPOINT_BINARY";
}

const PPT_RT_DOCUMENT = 0x03e8;
const PPT_RT_USER_EDIT_ATOM = 0x0ff5;
const PPT_RT_CURRENT_USER_ATOM = 0x0ff6;
const PPT_RT_PERSIST_DIRECTORY_ATOM = 0x1772;
const PPT_RT_CRYPT_SESSION_10_CONTAINER = 0x2f14;
const PPT_CURRENT_USER_UNENCRYPTED_TOKEN = 0xe391c05f;
const PPT_CURRENT_USER_ENCRYPTED_TOKEN = 0xf3d1c4df;

type PowerPointRecordHeader = {
  recVer: number;
  recInstance: number;
  recType: number;
  recLen: number;
  endOffset: number;
};

type PowerPointUserEdit = {
  offset: number;
  offsetLastEdit: number;
  offsetPersistDirectory: number;
  docPersistIdRef: number;
  persistIdSeed: number;
  encryptSessionPersistIdRef: number | null;
};

type PowerPointPersistDirectory = {
  entries: Array<{ persistId: number; offset: number }>;
};

type PowerPointAuthoritySuccess = {
  ok: true;
  encrypted: boolean;
};

function readPowerPointRecordHeader(
  bytes: Buffer,
  offset: number,
): PowerPointRecordHeader | OleFailure {
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset + 8 > bytes.length
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "A PowerPoint record header falls outside the bounded PowerPoint Document stream.",
    );
  }

  const versionAndInstance = bytes.readUInt16LE(offset);
  const recLen = bytes.readUInt32LE(offset + 4);
  const endOffset = offset + 8 + recLen;

  if (
    !Number.isSafeInteger(endOffset) ||
    endOffset < offset + 8 ||
    endOffset > bytes.length
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "A PowerPoint record length extends beyond the bounded PowerPoint Document stream.",
    );
  }

  return {
    recVer: versionAndInstance & 0x000f,
    recInstance: versionAndInstance >>> 4,
    recType: bytes.readUInt16LE(offset + 2),
    recLen,
    endOffset,
  };
}

function parsePowerPointCurrentUser(
  bytes: Buffer,
): { offsetToCurrentEdit: number; encryptedToken: boolean } | OleFailure {
  const header = readPowerPointRecordHeader(bytes, 0);
  if ("ok" in header) return header;

  if (
    header.recVer !== 0 ||
    header.recInstance !== 0 ||
    header.recType !== PPT_RT_CURRENT_USER_ATOM
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The Current User stream does not begin with the required CurrentUserAtom record.",
    );
  }

  if (header.endOffset !== bytes.length || header.recLen < 24) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The Current User stream contains an invalid CurrentUserAtom length.",
    );
  }

  const size = bytes.readUInt32LE(8);
  const headerToken = bytes.readUInt32LE(12);
  const offsetToCurrentEdit = bytes.readUInt32LE(16);
  const lenUserName = bytes.readUInt16LE(20);
  const docFileVersion = bytes.readUInt16LE(22);
  const majorVersion = bytes[24];
  const minorVersion = bytes[25];

  if (
    size !== 0x14 ||
    lenUserName > 255 ||
    docFileVersion !== 0x03f4 ||
    majorVersion !== 0x03 ||
    minorVersion !== 0x00
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The CurrentUserAtom fixed fields violate the PowerPoint binary format contract.",
    );
  }

  if (
    headerToken !== PPT_CURRENT_USER_UNENCRYPTED_TOKEN &&
    headerToken !== PPT_CURRENT_USER_ENCRYPTED_TOKEN
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The CurrentUserAtom encryption token is not recognized.",
    );
  }

  const relVersionOffset = 28 + lenUserName;
  if (relVersionOffset + 4 > header.endOffset) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The CurrentUserAtom user-name fields are truncated.",
    );
  }

  const relVersion = bytes.readUInt32LE(relVersionOffset);
  if (relVersion !== 0x08 && relVersion !== 0x09) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The CurrentUserAtom release version is unsupported.",
    );
  }

  const withoutUnicode = relVersionOffset + 4;
  const withUnicode = withoutUnicode + lenUserName * 2;
  if (
    header.endOffset !== withoutUnicode &&
    header.endOffset !== withUnicode
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The CurrentUserAtom optional Unicode user-name field has an invalid length.",
    );
  }

  return {
    offsetToCurrentEdit,
    encryptedToken: headerToken === PPT_CURRENT_USER_ENCRYPTED_TOKEN,
  };
}

function parsePowerPointUserEdit(
  bytes: Buffer,
  offset: number,
): PowerPointUserEdit | OleFailure {
  const header = readPowerPointRecordHeader(bytes, offset);
  if ("ok" in header) return header;

  if (
    header.recVer !== 0 ||
    header.recInstance !== 0 ||
    header.recType !== PPT_RT_USER_EDIT_ATOM ||
    (header.recLen !== 0x1c && header.recLen !== 0x20)
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "A PowerPoint user-edit record violates the UserEditAtom header contract.",
    );
  }

  const minorVersion = bytes[offset + 14];
  const majorVersion = bytes[offset + 15];
  const offsetLastEdit = bytes.readUInt32LE(offset + 16);
  const offsetPersistDirectory = bytes.readUInt32LE(offset + 20);
  const docPersistIdRef = bytes.readUInt32LE(offset + 24);
  const persistIdSeed = bytes.readUInt32LE(offset + 28);
  const encryptSessionPersistIdRef =
    header.recLen === 0x20
      ? bytes.readUInt32LE(offset + 36)
      : null;

  if (minorVersion !== 0 || majorVersion !== 3 || docPersistIdRef !== 1) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "A PowerPoint UserEditAtom fixed field violates the live-persist authority contract.",
    );
  }

  if (
    (offsetLastEdit !== 0 && offsetLastEdit >= offset) ||
    offsetPersistDirectory <= offsetLastEdit ||
    offsetPersistDirectory >= offset
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "A PowerPoint UserEditAtom contains impossible revision or persist-directory offsets.",
    );
  }

  return {
    offset,
    offsetLastEdit,
    offsetPersistDirectory,
    docPersistIdRef,
    persistIdSeed,
    encryptSessionPersistIdRef,
  };
}

function parsePowerPointPersistDirectory(args: {
  bytes: Buffer;
  offset: number;
  offsetLastEdit: number;
}): PowerPointPersistDirectory | OleFailure {
  const header = readPowerPointRecordHeader(args.bytes, args.offset);
  if ("ok" in header) return header;

  if (
    header.recVer !== 0 ||
    header.recInstance !== 0 ||
    header.recType !== PPT_RT_PERSIST_DIRECTORY_ATOM ||
    (header.recLen !== 0 && header.recLen < 8) ||
    header.recLen % 4 !== 0
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "A PowerPoint PersistDirectoryAtom header is invalid.",
    );
  }

  const entries: Array<{ persistId: number; offset: number }> = [];
  const localPersistIds = new Set<number>();
  let cursor = args.offset + 8;

  while (cursor < header.endOffset) {
    if (cursor + 4 > header.endOffset) {
      return failure(
        "OLE_STREAM_CHAIN_INVALID",
        "A PowerPoint persist-directory entry header is truncated.",
      );
    }

    const packed = args.bytes.readUInt32LE(cursor);
    cursor += 4;

    const persistId = packed & 0x000fffff;
    const cPersist = packed >>> 20;

    if (
      persistId > 0x000ffffe ||
      cPersist < 1 ||
      persistId + cPersist - 1 > 0x000ffffe ||
      cursor + cPersist * 4 > header.endOffset
    ) {
      return failure(
        "OLE_STREAM_CHAIN_INVALID",
        "A PowerPoint persist-directory entry violates identifier or length bounds.",
      );
    }

    for (let index = 0; index < cPersist; index += 1) {
      const currentPersistId = persistId + index;
      if (localPersistIds.has(currentPersistId)) {
        return failure(
          "OLE_STREAM_CHAIN_INVALID",
          "A PowerPoint PersistDirectoryAtom contains a duplicate persist identifier.",
        );
      }
      localPersistIds.add(currentPersistId);

      const persistOffset = args.bytes.readUInt32LE(cursor);
      cursor += 4;

      if (
        persistOffset < args.offsetLastEdit ||
        persistOffset >= args.offset
      ) {
        return failure(
          "OLE_STREAM_CHAIN_INVALID",
          "A PowerPoint persist object offset falls outside its corresponding edit interval.",
        );
      }

      entries.push({
        persistId: currentPersistId,
        offset: persistOffset,
      });
    }
  }

  if (cursor !== header.endOffset) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The PowerPoint persist-directory payload cannot be consumed exactly.",
    );
  }

  return { entries };
}

function inspectPowerPointPersistAuthority(args: {
  powerPointDocument: Buffer;
  currentUser: Buffer;
}): PowerPointAuthoritySuccess | OleFailure {
  const currentUser = parsePowerPointCurrentUser(args.currentUser);
  if ("ok" in currentUser) return currentUser;

  if (
    currentUser.offsetToCurrentEdit === 0 ||
    currentUser.offsetToCurrentEdit >= args.powerPointDocument.length
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The CurrentUserAtom does not point to a valid current PowerPoint user edit.",
    );
  }

  const editsNewestFirst: Array<{
    edit: PowerPointUserEdit;
    directory: PowerPointPersistDirectory;
  }> = [];
  const seenEditOffsets = new Set<number>();
  let editOffset = currentUser.offsetToCurrentEdit;

  while (editOffset !== 0) {
    if (seenEditOffsets.has(editOffset)) {
      return failure(
        "OLE_STREAM_CHAIN_INVALID",
        "The PowerPoint user-edit chain contains a cycle.",
      );
    }
    seenEditOffsets.add(editOffset);

    const edit = parsePowerPointUserEdit(
      args.powerPointDocument,
      editOffset,
    );
    if ("ok" in edit) return edit;

    const directory = parsePowerPointPersistDirectory({
      bytes: args.powerPointDocument,
      offset: edit.offsetPersistDirectory,
      offsetLastEdit: edit.offsetLastEdit,
    });
    if ("ok" in directory) return directory;

    editsNewestFirst.push({ edit, directory });
    editOffset = edit.offsetLastEdit;
  }

  const persistDirectory = new Map<number, number>();
  for (let index = editsNewestFirst.length - 1; index >= 0; index -= 1) {
    for (const entry of editsNewestFirst[index]!.directory.entries) {
      persistDirectory.set(entry.persistId, entry.offset);
    }
  }

  const latestEdit = editsNewestFirst[0]?.edit;
  if (!latestEdit) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The PowerPoint file does not expose a current user edit.",
    );
  }

  let highestPersistId = 0;
  for (const persistId of persistDirectory.keys()) {
    highestPersistId = Math.max(highestPersistId, persistId);
  }
  if (latestEdit.persistIdSeed < highestPersistId) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The latest PowerPoint persist identifier seed is lower than the authoritative persist directory.",
    );
  }

  const documentOffset = persistDirectory.get(latestEdit.docPersistIdRef);
  if (documentOffset === undefined) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The authoritative PowerPoint persist directory does not contain the document persist object.",
    );
  }

  const encrypted =
    currentUser.encryptedToken ||
    latestEdit.encryptSessionPersistIdRef !== null;

  if (encrypted && editsNewestFirst.length !== 1) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "An encrypted PowerPoint Document stream must contain exactly one authoritative UserEditAtom.",
    );
  }

  if (encrypted) {
    const encryptionPersistId = latestEdit.encryptSessionPersistIdRef;
    if (encryptionPersistId === null) {
      return failure(
        "OLE_STREAM_CHAIN_INVALID",
        "An encrypted PowerPoint file is missing the encryption-session persist reference.",
      );
    }

    const encryptionOffset = persistDirectory.get(encryptionPersistId);
    if (encryptionOffset === undefined) {
      return failure(
        "OLE_STREAM_CHAIN_INVALID",
        "The PowerPoint encryption-session persist reference is absent from the authoritative persist directory.",
      );
    }

    const encryptionHeader = readPowerPointRecordHeader(
      args.powerPointDocument,
      encryptionOffset,
    );
    if ("ok" in encryptionHeader) return encryptionHeader;

    if (
      encryptionHeader.recVer !== 0x0f ||
      encryptionHeader.recInstance !== 0 ||
      encryptionHeader.recType !== PPT_RT_CRYPT_SESSION_10_CONTAINER
    ) {
      return failure(
        "OLE_STREAM_CHAIN_INVALID",
        "The PowerPoint encryption-session persist object has an invalid record header.",
      );
    }

    return { ok: true, encrypted: true };
  }

  const documentHeader = readPowerPointRecordHeader(
    args.powerPointDocument,
    documentOffset,
  );
  if ("ok" in documentHeader) return documentHeader;

  if (
    documentHeader.recVer !== 0x0f ||
    documentHeader.recInstance !== 0 ||
    documentHeader.recType !== PPT_RT_DOCUMENT
  ) {
    return failure(
      "OLE_STREAM_CHAIN_INVALID",
      "The authoritative PowerPoint document persist object is not a DocumentContainer record.",
    );
  }

  return { ok: true, encrypted: false };
}

function suspiciousExecutableName(name: string) {
  const lower = normalizedName(name);
  return [
    ".exe",
    ".dll",
    ".scr",
    ".com",
    ".bat",
    ".cmd",
    ".ps1",
    ".vbs",
    ".js",
    ".jse",
    ".wsf",
  ].some((extension) => lower.endsWith(extension));
}

function executableSignature(bytes: Buffer) {
  return (
    (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) ||
    (bytes.length >= 4 &&
      bytes[0] === 0x7f &&
      bytes[1] === 0x45 &&
      bytes[2] === 0x4c &&
      bytes[3] === 0x46) ||
    (bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21)
  );
}

export function inspectOleStructuralSecurity(args: {
  bytes: Buffer;
  declaredExtension: Extract<NativeDocumentExtension, "doc" | "xls" | "ppt">;
  limits: NativeDocumentOleLimits;
}): OleStructuralInspectionResult {
  if (!validateLimits(args.limits)) {
    return failure("OLE_LIMITS_REQUIRED", "Explicit positive OLE/CFBF parser limits are required.");
  }

  const header = parseHeader(args.bytes, args.limits);
  if ("ok" in header) return header;

  const sectorOwners = new Map<number, string>();
  const partialContext: OleContext = {
    bytes: args.bytes,
    limits: args.limits,
    header,
    fat: [],
    sectorOwners,
  };

  const fat = buildFat(args.bytes, header, args.limits, sectorOwners);
  if (!Array.isArray(fat)) return fat;
  const context: OleContext = { ...partialContext, fat };

  const entries = parseDirectory(context);
  if (!Array.isArray(entries)) return entries;

  const miniFat = readMiniFat(context);
  if (!Array.isArray(miniFat)) return miniFat;

  const root = entries[0] as DirectoryEntry;
  if (root.streamSize > args.limits.maxTotalStreamBytes) {
    return failure("OLE_TOTAL_STREAM_SIZE_LIMIT_EXCEEDED", "The root mini stream exceeds the total stream budget.");
  }

  const rootMiniStream =
    root.streamSize === 0
      ? Buffer.alloc(0)
      : readRegularStream(context, root, "ROOT_MINISTREAM");
  if (!Buffer.isBuffer(rootMiniStream)) return rootMiniStream;

  const streamEntries = entries.filter((entry) => entry.objectType === 2);
  if (streamEntries.length > args.limits.maxStreams) {
    return failure("OLE_STREAM_COUNT_LIMIT_EXCEEDED", "The compound file contains too many user streams.");
  }

  let totalDeclaredStreamBytes = 0;
  for (const entry of streamEntries) {
    if (entry.streamSize > args.limits.maxStreamBytes) {
      return failure("OLE_STREAM_SIZE_LIMIT_EXCEEDED", "A compound-file stream exceeds the configured size limit.");
    }
    totalDeclaredStreamBytes += entry.streamSize;
    if (
      !Number.isSafeInteger(totalDeclaredStreamBytes) ||
      totalDeclaredStreamBytes > args.limits.maxTotalStreamBytes
    ) {
      return failure("OLE_TOTAL_STREAM_SIZE_LIMIT_EXCEEDED", "The compound file exceeds the total user-stream byte budget.");
    }
  }

  const rootStreams = streamEntries.filter((entry) => entry.parentId === 0);
  const format = applicationFormat({
    declaredExtension: args.declaredExtension,
    rootStreams,
  });
  if (typeof format !== "string") return format;

  const miniOwners = new Map<number, number>();
  let vbaProjectDetected = false;
  let embeddedObjectDetected = false;
  let encryptedPackageDetected = false;
  let executableStreamDetected = false;
  let powerPointDocumentData: Buffer | null = null;
  let currentUserData: Buffer | null = null;

  for (const entry of entries) {
    if (entry.objectType === 1) {
      const lower = normalizedName(entry.name);
      if (lower === "vba") vbaProjectDetected = true;
      if (lower === "objectpool" || lower === "embeddings" || lower.startsWith("mbd")) {
        embeddedObjectDetected = true;
      }
    }
  }

  for (const entry of streamEntries) {
    const data =
      entry.streamSize < MINI_STREAM_CUTOFF
        ? readMiniStream({
            entry,
            miniFat,
            rootMiniStream,
            miniOwners,
            limits: args.limits,
          })
        : readRegularStream(context, entry, `STREAM:${entry.id}`);
    if (!Buffer.isBuffer(data)) return data;

    const lower = normalizedName(entry.name);
    const path = normalizedName(entry.path ?? entry.name);

    if (entry.parentId === 0 && lower === "powerpoint document") {
      powerPointDocumentData = data;
    }
    if (entry.parentId === 0 && lower === "current user") {
      currentUserData = data;
    }

    if (
      lower === "_vba_project" ||
      path.includes("/vba/") ||
      (path.includes("/vba") && ["dir", "project", "projectwm", "projectlk"].includes(lower))
    ) {
      vbaProjectDetected = true;
    }

    if (
      lower === "\u0001ole10native" ||
      lower === "ole10native" ||
      lower === "package" ||
      path.includes("/objectpool/") ||
      path.includes("/embeddings/")
    ) {
      embeddedObjectDetected = true;
    }

    if (lower === "encryptedpackage" || lower === "encryptioninfo") {
      encryptedPackageDetected = true;
    }

    if (suspiciousExecutableName(entry.name) || executableSignature(data)) {
      executableStreamDetected = true;
    }
  }

  if (format === "POWERPOINT_BINARY") {
    if (powerPointDocumentData === null || currentUserData === null) {
      return failure(
        "OLE_APPLICATION_STREAM_MISSING",
        "A binary PowerPoint file must contain both the PowerPoint Document and Current User root streams required to establish live persist authority.",
      );
    }

    const powerPointAuthority = inspectPowerPointPersistAuthority({
      powerPointDocument: powerPointDocumentData,
      currentUser: currentUserData,
    });
    if (!powerPointAuthority.ok) return powerPointAuthority;
    if (powerPointAuthority.encrypted) {
      encryptedPackageDetected = true;
    }
  }

  return {
    ok: true,
    format,
    evidence: {
      majorVersion: header.majorVersion,
      sectorSize: header.sectorSize,
      miniSectorSize: MINI_SECTOR_SIZE,
      fatSectorCount: header.numberOfFatSectors,
      difatSectorCount: header.numberOfDifatSectors,
      miniFatSectorCount: header.numberOfMiniFatSectors,
      directoryEntryCount: entries.filter((entry) => entry.objectType !== 0).length,
      streamCount: streamEntries.length,
      totalDeclaredStreamBytes,
      applicationFormat: format,
      applicationStreamVerified: true,
      vbaProjectDetected,
      embeddedObjectDetected,
      encryptedPackageDetected,
      executableStreamDetected,
      sectorOwnershipVerified: true,
      directoryTreeVerified: true,
    },
  };
}
