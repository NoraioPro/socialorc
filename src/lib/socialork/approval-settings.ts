import { getSetting, setSetting } from "./settings";

const KEY = "approvals";
export async function getClientSignOff(workspaceId: string): Promise<boolean> {
  return ((await getSetting<{ clientSignOff?: boolean }>(workspaceId, KEY))?.clientSignOff) === true;
}
export const setClientSignOff = (workspaceId: string, on: boolean) => setSetting(workspaceId, KEY, { clientSignOff: on });
