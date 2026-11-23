import {spectroliteGoal} from "natlang:services";
import chooseKnowledgeStep from "./workOnVaultKnowledgeGoal/chooseKnowledgeStep.nl";
import readKnowledgeNote from "./workOnVaultKnowledgeGoal/readKnowledgeNote.nl";
import stageKnowledgeHandoff from "./workOnVaultKnowledgeGoal/stageKnowledgeHandoff.nl";
import summarizeKnowledgeWork from "./workOnVaultKnowledgeGoal/summarizeKnowledgeWork.nl";
import knowledgeResult from "./workOnVaultKnowledgeGoal/knowledgeResult.js";
import type {VaultKnowledgeReport,VaultKnowledgeRead,VaultKnowledgeHandoff,VaultKnowledgeStep} from "./types.js";
export default async function workOnVaultKnowledgeGoal(goal:string):Promise<VaultKnowledgeReport>{
 let current=await spectroliteGoal.inspect(),handoff:VaultKnowledgeHandoff|null=null,handoffConsidered=false;
 const reads:VaultKnowledgeRead[]=[],writtenPaths:string[]=[];
 // Preserve the authored coordinator's finite planning budget without manufacturing a completion.
 for(let remaining=52;remaining>0;remaining--){
  const step:VaultKnowledgeStep=await chooseKnowledgeStep(goal,current,reads,writtenPaths,handoffConsidered);
  if(step.kind==="finish")return knowledgeResult(await summarizeKnowledgeWork(goal,current,reads,writtenPaths,handoff),current,reads,handoff);
  if(step.kind==="read"){reads.push(await readKnowledgeNote(current,step.checks));continue;}
  if(step.kind==="handoff"){handoff=await stageKnowledgeHandoff(goal,current,step.audience);handoffConsidered=true;continue;}
  if(step.kind==="follow")await spectroliteGoal.follow(step.target,current.revision);
  else if(await spectroliteGoal.revise(current.revision,step.source)==="written"&&!writtenPaths.includes(current.path))writtenPaths.push(current.path);
  current=await spectroliteGoal.inspect();
 }
 throw new Error("The vault knowledge planning budget was exhausted before completion");
}
