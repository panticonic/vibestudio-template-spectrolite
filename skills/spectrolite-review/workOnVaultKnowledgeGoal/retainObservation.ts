import {observeVaultView,observeVaultOperation} from "../vaultObservationHistory.js";
import type {OpenVaultView,VaultObservationHistory,VaultOperationObservation} from "../types.js";
/** Pure accumulation of supplied actual readbacks; this grants no native authority. */
export default function retainObservation(history:VaultObservationHistory,current:OpenVaultView,operation:VaultOperationObservation|null):VaultObservationHistory{return observeVaultView(operation?observeVaultOperation(history,operation):history,current);}
