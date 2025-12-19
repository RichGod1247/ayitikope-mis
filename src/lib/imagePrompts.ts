// src/lib/imagePrompts.ts

import { ImagePrompt } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * The node types we support in the curriculum hierarchy.
 *
 * Matches what you used in the seed files:
 *  - "strand"
 *  - "subStrand"
 *  - "contentStandard"
 *  - "indicator"
 *  - "exemplar"
 */
export type NodeType =
  | "strand"
  | "subStrand"
  | "contentStandard"
  | "indicator"
  | "exemplar";

/**
 * Options for fetching image prompts for a specific curriculum node.
 *
 * Any of the *_Code fields may be null / omitted depending on nodeType.
 * For example:
 *  - strand:        only strandCode (others null)
 *  - subStrand:     strandCode + subStrandCode
 *  - contentStandard: strandCode + subStrandCode + contentStandardCode
 *  - indicator:     all codes up to indicatorCode
 *  - exemplar:      all codes + exemplarIndex
 */
export interface GetImagePromptsForNodeOptions {
  phase: string;   // e.g. "KG"
  level: string;   // e.g. "KG1"
  subject: string; // e.g. "Our World and Our People"

  strandCode: string;
  subStrandCode?: string | null;
  contentStandardCode?: string | null;
  indicatorCode?: string | null;

  nodeType?: NodeType;
}

/**
 * Fetch *all* image prompts attached to a given curriculum node.
 *
 * Typical usage (indicator-level):
 *
 *   const prompts = await getImagePromptsForNode({
 *     phase: "KG",
 *     level: "KG1",
 *     subject: "Our World and Our People",
 *     strandCode: "K1.2",
 *     subStrandCode: "K1.2.3",
 *     contentStandardCode: "K1.2.3.1",
 *     indicatorCode: "K1.2.3.1.4",
 *     nodeType: "indicator",
 *   });
 *
 * You can then feed prompts[0].prompt into your image generator,
 * or loop through them for multiple variants.
 */
export async function getImagePromptsForNode(
  opts: GetImagePromptsForNodeOptions,
): Promise<ImagePrompt[]> {
  const {
    phase,
    level,
    subject,
    strandCode,
    subStrandCode = null,
    contentStandardCode = null,
    indicatorCode = null,
    nodeType,
  } = opts;

  return prisma.imagePrompt.findMany({
    where: {
      phase,
      level,
      subject,
      strandCode,
      subStrandCode,
      contentStandardCode,
      indicatorCode,
      ...(nodeType ? { nodeType } : {}),
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Convenience helper:
 * get a *single* image prompt for a node.
 *
 * strategy:
 *  - "first" (default): first by createdAt
 *  - "random": random among all prompts found
 */
export async function getOneImagePromptForNode(
  opts: GetImagePromptsForNodeOptions,
  strategy: "first" | "random" = "first",
): Promise<ImagePrompt | null> {
  const prompts = await getImagePromptsForNode(opts);

  if (prompts.length === 0) return null;

  if (strategy === "first" || prompts.length === 1) {
    return prompts[0];
  }

  const idx = Math.floor(Math.random() * prompts.length);
  return prompts[idx];
}
