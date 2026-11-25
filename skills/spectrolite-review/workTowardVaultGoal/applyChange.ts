import applyVaultChange from "../applyVaultChange.js";
import type {OpenVaultView,VaultChange,VaultOperationObservation} from "../types.js";
/** Preserve native exact-target/CAS operation and its current readback unchanged. */
export default async function applyChange(before:OpenVaultView,change:VaultChange):Promise<{current:OpenVaultView;observation:VaultOperationObservation}>{return applyVaultChange(before,change);}
