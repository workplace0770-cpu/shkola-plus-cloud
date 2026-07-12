import{ensureAccountsTable,setupNeeded,userFromRequest}from"../../../db/accounts";
export async function GET(r:Request){await ensureAccountsTable();return Response.json({setupNeeded:await setupNeeded(),profile:await userFromRequest(r)})}
