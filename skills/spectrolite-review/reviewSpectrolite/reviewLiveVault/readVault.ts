import {spectroliteRead} from "natlang:services";
import type {SpectroliteReviewRequest} from "../../types.js";
/** Read the caller's assigned canonical vault document and browser preview. */
export default async function readVault():Promise<SpectroliteReviewRequest>{
 return spectroliteRead.observe();
}
