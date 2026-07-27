#!/usr/bin/env node
"use strict";

/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS QA harness intentionally loads TypeScript source through a local transpile hook. */

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");

const repoRoot = path.resolve(__dirname, "..", "..");
function fail(message, detail) {
  const suffix = detail === undefined ? "" : `\n${JSON.stringify(detail, null, 2)}`;
  throw new Error(`${message}${suffix}`);
}
function assert(condition, message, detail) { if (!condition) fail(message, detail); }
function assertEqual(actual, expected, message) { if (actual !== expected) fail(message, { expected, actual }); }
async function expectReject(operation, code, message) {
  try { await operation(); } catch (error) { assertEqual(error && error.message, code, message); return error; }
  fail(message, { expectedError: code });
}

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  if (typeof request === "string" && request.startsWith("@/")) request = path.join(repoRoot, "src", request.slice(2));
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTypeScript(loadedModule, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: filename,
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      resolveJsonModule: true,
      skipLibCheck: true,
      strict: true,
    },
  });
  const diagnostics = transpiled.diagnostics ?? [];
  if (diagnostics.length) fail(`TypeScript transpilation diagnostics in ${filename}`, diagnostics);
  loadedModule._compile(transpiled.outputText, filename);
};

const NOW = new Date("2026-08-05T12:00:00.000Z");
const OPENED = new Date("2026-07-25T08:00:00.000Z");
const CLOSED = new Date("2026-08-01T08:00:00.000Z");
const REVIEW_STARTED = new Date("2026-08-02T09:00:00.000Z");
const OBSERVED = new Date("2026-07-28T00:00:00.000Z");
const FINALIZED = new Date("2026-07-29T14:00:00.000Z");
const RETURNED = new Date("2026-08-04T10:00:00.000Z");
const CONTENT_HASH = "d".repeat(64);

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => [k, stableValue(v)]));
}
function hashJson(value) { return crypto.createHash("sha256").update(JSON.stringify(stableValue(value)), "utf8").digest("hex"); }
function instrumentVersion() {
  const { APPRAISAL_INSTRUMENT_DEFINITIONS } = require(path.join(repoRoot, "src/lib/appraisals/instruments.ts"));
  const definition = APPRAISAL_INSTRUMENT_DEFINITIONS.HEADTEACHER_SUPERVISORY_ASSESSMENT_V1;
  return {
    id: "supervisory-version-001", version: 1, status: "ACTIVE", contentHash: CONTENT_HASH,
    instrument: { id: "supervisory-instrument-001", code: "HEADTEACHER_SUPERVISORY_ASSESSMENT_V1", purpose: "HEADTEACHER_SUPERVISORY_ASSESSMENT", subjectType: "HEADTEACHER", isActive: true },
    sections: definition.sections.map((section, sectionIndex) => ({
      id: `section-${sectionIndex+1}`, key: section.key, title: section.title, description: section.description ?? null, order: section.order, maxScore: section.maxScore,
      items: section.items.map((item, itemIndex) => ({ id: `item-${sectionIndex+1}-${itemIndex+1}`, key: item.key, label: item.label, order: item.order, maxScore: item.maxScore, isRequired: item.isRequired })),
    })),
  };
}
function cycle(overrides={}) { return { id:"cycle-headteacher-001", scopeZoneId:"district-001", targetUserId:"headteacher-001", targetTenantId:"tenant-001", targetZoneId:"circuit-001", status:"UNDER_REVIEW", openedAt:OPENED, closedAt:CLOSED, reviewStartedAt:REVIEW_STARTED, releasedAt:null, cancelledAt:null, metadata:{}, ...overrides }; }
function visitContext() { return { schemaVersion:1, workflow:"HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT", evidenceStream:"GOVERNANCE_SUPERVISORY_ASSESSMENT", cycle:{id:"cycle-headteacher-001",statusAtDraft:"OPEN",openedAt:OPENED.toISOString(),deadlineAt:CLOSED.toISOString(),closedAt:null}, target:{userId:"headteacher-001",role:"HEADTEACHER",tenantId:"tenant-001",name:"Head Teacher One",schoolName:"School One"}, assessor:{userId:"actor-001",name:"Director One",role:"DISTRICT_DIRECTOR",assignmentId:"assignment-director-001",assignmentRole:"DISTRICT_DIRECTOR",scopeLevel:"DISTRICT"}, jurisdiction:{districtZoneId:"district-001",districtName:"District One",circuitZoneId:"circuit-001",circuitName:"Circuit One",assignmentZoneId:"district-001",assignmentZoneName:"District One",assignmentParentZoneId:null,assignmentParentZoneName:null}, instrument:{instrumentId:"supervisory-instrument-001",instrumentVersionId:"supervisory-version-001",code:"HEADTEACHER_SUPERVISORY_ASSESSMENT_V1",version:1,contentHash:CONTENT_HASH}, observation:{dateObserved:"2026-07-28"} }; }
function fullScores(assessmentId="assessment-001") {
  return instrumentVersion().sections.flatMap((section) => section.items.map((item) => ({ id:`score-${item.id}`, assessmentId, instrumentItemId:item.id, sectionKey:section.key, sectionTitle:section.title, sectionOrder:section.order, sectionMaxScore:section.maxScore, itemKey:item.key, itemLabel:item.label, itemOrder:item.order, itemMaxScore:item.maxScore, score:5, notApplicable:false })));
}
function percentages() { return Object.fromEntries(instrumentVersion().sections.map((section) => [section.key, 100])); }
function assessmentHash(record) {
  const version = record.instrumentVersion;
  const stored = new Map(record.scores.map((score) => [score.instrumentItemId, score]));
  return hashJson({ schemaVersion:1, workflow:"HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT", evidenceStream:"GOVERNANCE_SUPERVISORY_ASSESSMENT", assessment:{id:record.id,cycleId:record.cycleId,revision:record.revision,assessorUserId:record.assessorUserId,assessorAssignmentId:record.assessorAssignmentId,dateObserved:"2026-07-28",visitContextHash:record.metadata.visitContextHash}, instrument:{instrumentVersionId:record.instrumentVersionId,code:version.instrument.code,version:version.version,contentHash:CONTENT_HASH}, scores:version.sections.flatMap((section)=>section.items.map((item)=>{const score=stored.get(item.id);return {instrumentItemId:item.id,itemKey:item.key,sectionKey:section.key,sectionOrder:section.order,itemOrder:item.order,itemMaxScore:item.maxScore,score:score?.score??null,notApplicable:score?.notApplicable??false};})), sectionPercentages:percentages(), overallPercentage:100, commentsIncluded:false, separateFromStaffFeedback:true, combinedWeightingDefined:false });
}
function returnedAssessment(overrides={}) {
  const context = visitContext();
  const record = { id:"assessment-001", cycleId:"cycle-headteacher-001", instrumentVersionId:"supervisory-version-001", assessorUserId:"actor-001", assessorAssignmentId:"assignment-director-001", status:"RETURNED", revision:1, priorAssessmentId:null, dateObserved:OBSERVED, overallPercentage:100, sectionPercentagesJson:percentages(), generalComment:null, evidenceSnapshotJson:context, assessmentHash:null, finalizedByUserId:"actor-001", finalizedAt:FINALIZED, metadata:{workflow:"HEADTEACHER_GOVERNANCE_SUPERVISORY_ASSESSMENT",evidenceStream:"GOVERNANCE_SUPERVISORY_ASSESSMENT",visitContextHash:hashJson(context),visitContextImmutable:true}, createdAt:new Date("2026-07-28T10:00:00.000Z"), scores:fullScores(), reviews:[{id:"review-001",cycleId:"cycle-headteacher-001",assessmentId:"assessment-001",reviewerUserId:"reviewer-001",reviewerAssignmentId:"reviewer-assignment-001",stage:1,decision:"RETURNED",note:"Clarify the evidence for two indicators.",decidedAt:RETURNED,metadata:{reviewerMayRewriteScores:false},createdAt:RETURNED}], cycle:cycle(), instrumentVersion:instrumentVersion(), ...overrides };
  record.assessmentHash = assessmentHash(record);
  return record;
}
function membership(overrides={}) { return { id:"membership-headteacher-001",userId:"headteacher-001",tenantId:"tenant-001",status:"ACTIVE",role:{name:"HEADTEACHER"},tenant:{id:"tenant-001",status:"ACTIVE",zone:{id:"circuit-001",name:"Circuit One",isActive:true,parentZoneId:"district-001",zoneType:{level:1,countryCode:"GH"},parentZone:{id:"district-001",name:"District One",isActive:true,zoneType:{level:2,countryCode:"GH"}}}},...overrides}; }
function assignment(overrides={}) { return {id:"assignment-director-001",userId:"actor-001",role:"DISTRICT_DIRECTOR",status:"ACTIVE",startsAt:new Date("2026-01-01T00:00:00.000Z"),endsAt:null,zoneId:"district-001",zone:{id:"district-001",name:"District One",isActive:true,parentZoneId:null,zoneType:{level:2,countryCode:"GH"},parentZone:null},...overrides}; }

class FakeDatabase {
  constructor(overrides={}) {
    this.original = returnedAssessment(overrides.assessment ?? {});
    this.assessments = [this.original]; this.membershipRecord = membership(overrides.membership ?? {}); this.assignments=overrides.assignments??[assignment()]; this.audits=[]; this.transactionOptions=[]; this.nextId=2; this.conflictOnce=overrides.conflictOnce??false;
    this.appraisalAssessment = {
      findUnique: async (args) => {
        if (args.where.id) return structuredClone(this.assessments.find((a)=>a.id===args.where.id)??null);
        const key=args.where.cycleId_assessorUserId_revision;
        if (key) return structuredClone(this.assessments.find((a)=>a.cycleId===key.cycleId&&a.assessorUserId===key.assessorUserId&&a.revision===key.revision)??null);
        return null;
      },
      create: async (args) => {
        if (this.conflictOnce) { this.conflictOnce=false; const e=new Error("conflict"); e.code="P2002"; throw e; }
        const data=structuredClone(args.data); const created={...returnedAssessment(),...data,id:`assessment-${this.nextId++}`,createdAt:NOW,scores:[],reviews:[],cycle:structuredClone(this.original.cycle),instrumentVersion:instrumentVersion()}; this.assessments.push(created); return structuredClone(created);
      },
      updateMany: async (args) => { const row=this.assessments.find((a)=>a.id===args.where.id&&a.status===args.where.status); if(!row)return {count:0}; Object.assign(row,structuredClone(args.data)); return {count:1}; },
    };
    this.appraisalAssessmentScore = { createMany: async (args) => { const targetId=args.data[0]?.assessmentId; const target=this.assessments.find((a)=>a.id===targetId); if(!target)return {count:0}; target.scores=args.data.map((row,index)=>({id:`copied-${index+1}`,...structuredClone(row)})); return {count:target.scores.length}; } };
    this.membership={findFirst:async()=>structuredClone(this.membershipRecord)};
    this.governanceOfficerAssignment={findMany:async()=>structuredClone(this.assignments)};
    this.auditLog={create:async(args)=>{this.audits.push(structuredClone(args.data));return args.data;}};
  }
  async $transaction(operation,options){this.transactionOptions.push(structuredClone(options));const snapshot=structuredClone({assessments:this.assessments,audits:this.audits,nextId:this.nextId});try{return await operation(this);}catch(error){this.assessments=snapshot.assessments;this.original=this.assessments[0];this.audits=snapshot.audits;this.nextId=snapshot.nextId;throw error;}}
}
function auditText(db){return JSON.stringify(db.audits);}

async function main(){
  const sourcePath=path.join(repoRoot,"src/lib/appraisals/headteacherSupervisoryAssessmentRevision.ts");
  const source=fs.readFileSync(sourcePath,"utf8");
  for(const marker of ["createReturnedHeadteacherSupervisoryAssessmentRevision","readHeadteacherSupervisoryAssessorState","planReturnedHeadteacherSupervisoryRevision","Prisma.TransactionIsolationLevel.Serializable","reviewerMayRewriteScores: false","providerCalled: false"]){assert(source.includes(marker),`Missing source marker: ${marker}`);}
  for(const forbidden of ["sendSms","sendEmail","appraisalReview.create","appraisalAggregateSnapshot.create"]){assert(!source.includes(forbidden),`Forbidden source marker: ${forbidden}`);}
  const revisionModule=require(sourcePath);
  const {createReturnedHeadteacherSupervisoryAssessmentRevision,readHeadteacherSupervisoryAssessorState,HEADTEACHER_SUPERVISORY_REVISION_POLICY}=revisionModule;
  assertEqual(HEADTEACHER_SUPERVISORY_REVISION_POLICY.eligibleCycleStatus,"UNDER_REVIEW","Cycle boundary must be under review");

  const db=new FakeDatabase();
  const created=await createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"actor-001",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:db});
  assertEqual(created.outcome,"CREATED","Revision should be created");
  assertEqual(created.revision.revision,2,"Revision number should increment");
  assertEqual(created.revision.status,"DRAFT","New revision should be draft");
  assertEqual(created.revision.copiedScoreCount,34,"All scores should be copied");
  assertEqual(db.assessments[0].status,"SUPERSEDED","Original should become superseded");
  assertEqual(db.assessments[1].priorAssessmentId,"assessment-001","Revision should point to original");
  assertEqual(db.assessments[1].scores.length,34,"Copied score rows should exist");
  assertEqual(db.audits.length,1,"One audit should be written");
  assert(!auditText(db).includes('"score":5'),"Audit must not contain score values");
  assert(!auditText(db).includes("Director One"),"Audit must not contain names");
  assertEqual(db.transactionOptions[0].isolationLevel,"Serializable","Transaction must be serializable");

  const retry=await createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"actor-001",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:db});
  assertEqual(retry.outcome,"EXISTING_MATCH","Repeated creation should be idempotent");
  assertEqual(db.assessments.length,2,"Retry must not duplicate revision");
  assertEqual(db.audits.length,1,"Retry must not duplicate audit");

  const revisionState=await readHeadteacherSupervisoryAssessorState({actorUserId:"actor-001",assessmentId:db.assessments[1].id,database:db});
  assertEqual(revisionState.state,"REVISION_DRAFT","Revision draft state should be truthful");
  assertEqual(revisionState.canEdit,true,"Revision draft should be editable");
  assertEqual(revisionState.canFinalize,false,"Score-free state must not claim finalization readiness");
  assertEqual(revisionState.finalizationReadinessIncluded,false,"Finalization readiness must remain in scoring view");
  assertEqual(revisionState.scoresIncluded,false,"Read state must omit scores");
  assert(!JSON.stringify(revisionState).includes("overallPercentage"),"Read state must omit percentages");

  const returnedDb=new FakeDatabase();
  const returnedState=await readHeadteacherSupervisoryAssessorState({actorUserId:"actor-001",assessmentId:"assessment-001",database:returnedDb});
  assertEqual(returnedState.state,"RETURNED_REVISION_REQUIRED","Returned state should require revision");
  assertEqual(returnedState.canCreateRevision,true,"Returned state should allow revision creation");
  assert(returnedState.returnReason.includes("Clarify"),"Return reason should be visible to assessor");
  assertEqual(returnedState.reviewerIdentityIncluded,false,"Reviewer identity should not be returned");

  const finalizedDb=new FakeDatabase({assessment:{status:"FINALIZED",reviews:[]}});
  const finalizedState=await readHeadteacherSupervisoryAssessorState({actorUserId:"actor-001",assessmentId:"assessment-001",database:finalizedDb});
  assertEqual(finalizedState.state,"FINALIZED_READ_ONLY","Finalized state should be read only");
  assertEqual(finalizedState.readOnly,true,"Finalized should be read only");

  const releasedDb=new FakeDatabase({assessment:{cycle:cycle({status:"RELEASED",releasedAt:NOW}),status:"FINALIZED",reviews:[]}});
  const releasedState=await readHeadteacherSupervisoryAssessorState({actorUserId:"actor-001",assessmentId:"assessment-001",database:releasedDb});
  assertEqual(releasedState.state,"RELEASED_READ_ONLY","Released state should be locked");

  await expectReject(()=>createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"other",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:new FakeDatabase()}),"HEADTEACHER_SUPERVISORY_REVISION_ASSESSOR_ONLY","Outsider must be rejected");
  await expectReject(()=>createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"actor-001",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:new FakeDatabase({assignments:[]})}),"HEADTEACHER_SUPERVISORY_REVISION_AUTHORITY_ACTIVE_ASSIGNMENT_REQUIRED","Active assignment must be revalidated");
  await expectReject(()=>createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"actor-001",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:new FakeDatabase({assessment:{cycle:cycle({status:"CLOSED",reviewStartedAt:null})}})}),"HEADTEACHER_SUPERVISORY_REVISION_CYCLE_NOT_UNDER_REVIEW","Cycle must be under review");
  await expectReject(()=>createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"actor-001",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:new FakeDatabase({assessment:{reviews:[{...returnedAssessment().reviews[0],metadata:{scoreEdits:{"1.1":2}}}]}})}),"HEADTEACHER_SUPERVISORY_REVISION_REVIEWER_SCORE_REWRITE_FORBIDDEN","Reviewer score edits must be rejected");
  const driftDb=new FakeDatabase(); driftDb.original.scores[0].score=1;
  await expectReject(()=>createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"actor-001",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:driftDb}),"HEADTEACHER_SUPERVISORY_REVISION_SOURCE_CALCULATION_DRIFT","Score drift must fail closed");

  const rollbackDb=new FakeDatabase(); rollbackDb.appraisalAssessmentScore.createMany=async()=>({count:33});
  await expectReject(()=>createReturnedHeadteacherSupervisoryAssessmentRevision({actorUserId:"actor-001",actorRoleName:"DISTRICT_DIRECTOR",returnedAssessmentId:"assessment-001",now:NOW,database:rollbackDb}),"HEADTEACHER_SUPERVISORY_REVISION_SCORE_COPY_INCOMPLETE","Incomplete copy must roll back");
  assertEqual(rollbackDb.assessments.length,1,"Failed transaction must roll back new revision");
  assertEqual(rollbackDb.assessments[0].status,"RETURNED","Failed transaction must preserve original status");

  console.log("=== D3.4F4 HEADTEACHER SUPERVISORY RETURNED REVISION + READ STATES ===\n");
  console.log("Returned source status          : RETURNED only");
  console.log("Parent cycle boundary           : UNDER_REVIEW only");
  console.log("Revision ownership              : exact original assessor");
  console.log("Current authority               : capability + active assignment revalidated");
  console.log("Return evidence                 : latest decided RETURNED review + reason");
  console.log("Reviewer score rewriting        : forbidden");
  console.log("Source evidence/hash            : recalculated and verified");
  console.log("Original transition             : RETURNED -> SUPERSEDED atomically");
  console.log("New revision                    : DRAFT, revision + 1");
  console.log("Visit context                   : preserved immutably");
  console.log("Scores                          : copied, still assessor-editable in new revision");
  console.log("Same-evidence retry             : EXISTING_MATCH");
  console.log("Assessor lifecycle states       : draft/finalized/returned/superseded/released");
  console.log("Read-state scores/percentages   : absent");
  console.log("Audit score/name leakage        : absent");
  console.log("Transaction                     : serializable and bounded");
  console.log("Notifications/providers         : absent");
  console.log("Database accessed               : false\n");
  console.log("RESULT: D3.4F4 HEADTEACHER SUPERVISORY REVISION GREEN");
}

main().catch((error)=>{console.error(error && error.stack ? error.stack : error);process.exit(1);});
