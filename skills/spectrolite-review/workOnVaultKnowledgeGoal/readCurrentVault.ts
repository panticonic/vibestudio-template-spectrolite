import {spectroliteGoal} from "natlang:services";
import type {OpenVaultView} from "../types.js";
/** Actual current editor source and native revision; no navigation or mutation. */
export default async function readCurrentVault():Promise<OpenVaultView>{return spectroliteGoal.inspect();}
