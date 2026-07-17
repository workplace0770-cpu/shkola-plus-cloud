import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../../db/accounts";
import { ensureFinanceTables, financeError, financeStatuses, validateFinanceTargets, type FinanceStatus } from "../../../../../db/finance";
import { recordAudit } from "../../../../../db/audit";

type Context={params:Promise<{id:string}>};
type UpdateInput={title?:string;description?:string|null;amount?:number|string;status?:FinanceStatus;studentId?:number|string|null;classId?:number|string|null;dueDate?:string|null;paidAt?:string|null};
const has=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const clean=(value:unknown,max:number)=>String(value??"").trim().slice(0,max);
const nullableId=(value:unknown)=>value===null||value===undefined||value===""?null:Number(value);
const validDate=(value:string|null)=>!value||!Number.isNaN(Date.parse(value));
async function recordId(context:Context){return String((await context.params).id||"").trim()}
async function admin(request:Request){await ensureAccountsTable();await ensureFinanceTables();const user=await userFromRequest(request);if(!user)return{response:Response.json({error:"Требуется вход"},{status:401})};if(user.role!=="admin")return{response:Response.json({error:"Недостаточно прав"},{status:403})};return{user}}

export async function PATCH(request:Request,context:Context){
 try{
  const access=await admin(request);if("response" in access)return access.response;const id=await recordId(context),existing=await env.DB.prepare("SELECT id,status,student_id studentId,class_id classId,paid_at paidAt FROM finance_records WHERE id=?").bind(id).first<{id:string;status:FinanceStatus;studentId:number|null;classId:number|null;paidAt:string|null}>();if(!existing)return Response.json({error:"Запись не найдена"},{status:404});
  let input:UpdateInput;try{input=await request.json() as UpdateInput}catch{return Response.json({error:"Некорректные данные"},{status:400})}
  const fields:string[]=[],values:(string|number|null)[]=[];
  if(has(input,"title")){const title=clean(input.title,160);if(!title)return Response.json({error:"Название не может быть пустым"},{status:400});fields.push("title=?");values.push(title)}
  if(has(input,"description")){fields.push("description=?");values.push(clean(input.description,2000)||null)}
  if(has(input,"amount")){const amount=Number(input.amount);if(!Number.isSafeInteger(amount)||amount<=0)return Response.json({error:"Сумма должна быть положительным целым числом"},{status:400});fields.push("amount=?");values.push(amount)}
  let status=existing.status;if(has(input,"status")){if(!financeStatuses.includes(input.status as FinanceStatus))return Response.json({error:"Некорректный статус"},{status:400});status=input.status as FinanceStatus;fields.push("status=?");values.push(status)}
  const studentId=has(input,"studentId")?nullableId(input.studentId):existing.studentId,classId=has(input,"classId")?nullableId(input.classId):existing.classId;
  if((studentId!==null&&(!Number.isInteger(studentId)||studentId<1))||(classId!==null&&(!Number.isInteger(classId)||classId<1)))return Response.json({error:"Некорректный ученик или класс"},{status:400});
  if(has(input,"studentId")||has(input,"classId")){const target=await validateFinanceTargets(studentId,classId);if("error" in target)return Response.json({error:target.error},{status:400});if(has(input,"studentId")){fields.push("student_id=?");values.push(studentId)}if(has(input,"classId")){fields.push("class_id=?");values.push(classId)}}
  if(has(input,"dueDate")){const due=clean(input.dueDate,40)||null;if(!validDate(due))return Response.json({error:"Некорректный срок"},{status:400});fields.push("due_date=?");values.push(due?new Date(due).toISOString():null)}
  if(has(input,"paidAt")){const paid=clean(input.paidAt,40)||null;if(!validDate(paid))return Response.json({error:"Некорректная дата оплаты"},{status:400});fields.push("paid_at=?");values.push(paid?new Date(paid).toISOString():null)}
  else if(has(input,"status")){fields.push("paid_at=?");values.push(status==="paid"?(existing.paidAt??new Date().toISOString()):null)}
  if(!fields.length)return Response.json({error:"Нет изменений"},{status:400});fields.push("updated_at=?");values.push(new Date().toISOString());values.push(id);
  await env.DB.prepare(`UPDATE finance_records SET ${fields.join(",")} WHERE id=?`).bind(...values).run();await recordAudit(access.user,{action:"finance.updated",entityType:"finance",entityId:id,summary:"Изменена финансовая запись",metadata:{status,studentId,classId}});return Response.json({ok:true});
 }catch{return financeError()}
}

export async function DELETE(request:Request,context:Context){
 try{const access=await admin(request);if("response" in access)return access.response;const id=await recordId(context),existing=await env.DB.prepare("SELECT title,amount,status FROM finance_records WHERE id=?").bind(id).first<{title:string;amount:number;status:string}>(),result=await env.DB.prepare("DELETE FROM finance_records WHERE id=?").bind(id).run();if(!result.meta.changes)return Response.json({error:"Запись не найдена"},{status:404});await recordAudit(access.user,{action:"finance.deleted",entityType:"finance",entityId:id,summary:`Удалена финансовая запись: ${existing?.title??id}`,metadata:{amount:existing?.amount??null,status:existing?.status??null}});return Response.json({ok:true})}catch{return financeError()}
}
