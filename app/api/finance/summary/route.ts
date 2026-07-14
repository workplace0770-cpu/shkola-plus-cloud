import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../db/accounts";
import { derivedStatusSql, ensureFinanceTables, financeError, financeScope } from "../../../../db/finance";

export async function GET(request:Request){
 try{
  await ensureAccountsTable();await ensureFinanceTables();const user=await userFromRequest(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const scope=financeScope(user),status=derivedStatusSql("f"),row=await env.DB.prepare(`SELECT
   COALESCE(SUM(CASE WHEN f.type='income' THEN f.amount ELSE 0 END),0) totalIncome,
   COALESCE(SUM(CASE WHEN f.type IN ('expense','event_budget') THEN f.amount ELSE 0 END),0) totalExpenses,
   COALESCE(SUM(CASE WHEN ${status}='pending' THEN f.amount ELSE 0 END),0) totalPending,
   COALESCE(SUM(CASE WHEN ${status}='paid' THEN f.amount ELSE 0 END),0) totalPaid,
   COALESCE(SUM(CASE WHEN ${status}='overdue' THEN f.amount ELSE 0 END),0) totalOverdue,
   SUM(CASE WHEN ${status}='pending' THEN 1 ELSE 0 END) countPending,
   SUM(CASE WHEN ${status}='paid' THEN 1 ELSE 0 END) countPaid,
   SUM(CASE WHEN ${status}='overdue' THEN 1 ELSE 0 END) countOverdue
   FROM finance_records f WHERE ${scope.sql}`).bind(...scope.params).first();
  return Response.json({summary:row??{totalIncome:0,totalExpenses:0,totalPending:0,totalPaid:0,totalOverdue:0,countPending:0,countPaid:0,countOverdue:0}});
 }catch{return financeError()}
}
