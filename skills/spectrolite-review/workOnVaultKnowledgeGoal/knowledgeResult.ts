import type {OpenVaultView,VaultKnowledgeRead,VaultKnowledgeHandoff,VaultKnowledgeReport,VaultKnowledgeOutcome} from "../types.js";
export default function knowledgeResult(summary:{outcome:VaultKnowledgeOutcome;authorityPath:string|null;answer:string},current:OpenVaultView,reads:VaultKnowledgeRead[],handoff:VaultKnowledgeHandoff|null):VaultKnowledgeReport {
 return {...summary,path:current.path,revision:current.revision,reads:reads.map(({view,review})=>({path:view.path,revision:view.revision,review})),handoff};
}
