import {spectroliteGoal} from "natlang:services";
import chooseVaultStep from "./workTowardVaultGoal/chooseVaultStep.nl";
import reviewCurrentVault from "./workTowardVaultGoal/reviewCurrentVault.nl";
import type {OpenVaultReport,OpenVaultView,OpenVaultDecision} from "./types.js";
export default async function workTowardVaultGoal(goal:string):Promise<OpenVaultReport>{
 let current=await spectroliteGoal.inspect(),edited=false;
 const previous:OpenVaultView[]=[];
 for(let remaining=36;remaining>0;remaining--){
  const step:OpenVaultDecision=await chooseVaultStep(goal,current,previous,edited);
  if(step.kind==="blocked")return {status:"blocked",reason:step.reason};
  if(step.kind==="review")return {status:edited?"edited":"reviewed",path:current.path,revision:current.revision,review:await reviewCurrentVault(current,step.checks)};
  if(!previous.some(view=>view.path===current.path&&view.revision===current.revision))previous.push(current);
  if(step.kind==="follow")await spectroliteGoal.follow(step.target,current.revision);
  else edited=(await spectroliteGoal.revise(current.revision,step.source)==="written")||edited;
  current=await spectroliteGoal.inspect();
 }
 throw new Error("The vault navigation planning budget was exhausted before completion");
}
