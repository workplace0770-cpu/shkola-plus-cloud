import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../../db/accounts";
import { derivedStatusSql, ensureFinanceTables, financeError, financeScope, financeStatuses, financeTypes, validateFinanceTargets, type FinanceStatus, type FinanceType } from "../../../../db/finance";

type CreateInput={type?:FinanceType;title?:string;description?:string;amount?:number|string;currency?:string;status?:FinanceStatus;studentId?:number|string|null;classId?:number|string|null;dueDate?:string|null;paidAt?:string|null};
const allowedType=(value:unknown):value is FinanceType=>financeTypes.includes(value as FinanceType);
const allowedStatus=(value:unknown):value is FinanceStatus=>financeStatuses.includes(value as FinanceStatus);
const nullableId=(value:unknown)=>value===null||value===undefined||value===""?null:Number(value);
const clean=(value:unknown,max:number)=>String(value??"").trim().slice(0,max);
const validDate=(value:string|null)=>!value||!Number.isNaN(Date.parse(value));

async function session(request:Request){await ensureAccountsTable();await ensureFinanceTables();return userFromRequest(request)}

export async function GET(request:Request){
 try{
  const user=await session(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const url=new URL(request.url),scope=financeScope(user),where=[scope.sql],params=[...scope.params] as (string|number)[],derived=derivedStatusSql("f");
  const status=url.searchParams.get("status"),type=url.searchParams.get("type"),classId=url.searchParams.get("class_id"),studentId=url.searchParams.get("student_id"),from=url.searchParams.get("from"),to=url.searchParams.get("to");
  if(status){if(!allowedStatus(status))return Response.json({error:"Некорректный статус"},{status:400});where.push(`${derived}=?`);params.push(status)}
  if(type){if(!allowedType(type))return Response.json({error:"Некорректный тип"},{status:400});where.push("f.type=?");params.push(type)}
  if(classId){const id=Number(classId);if(!Number.isInteger(id)||id<1)return Response.json({error:"Некорректный класс"},{status:400});where.push("f.class_id=?");params.push(id)}
  if(studentId){const id=Number(studentId);if(!Number.isInteger(id)||id<1)return Response.json({error:"Некорректный ученик"},{status:400});where.push("f.student_id=?");params.push(id)}
  if(from){if(!validDate(from))return Response.json({error:"Некорректная начальная дата"},{status:400});where.push("date(f.created_at)>=date(?)");params.push(from)}
  if(to){if(!validDate(to))return Response.json({error:"Некорректная конечная дата"},{status:400});where.push("date(f.created_at)<=date(?)");params.push(to)}
  const records=(await env.DB.prepare(`SELECT f.id,f.type,f.title,f.description,f.amount,f.currency,${derived} status,f.student_id studentId,f.class_id classId,f.created_by createdBy,f.due_date dueDate,f.paid_at paidAt,f.created_at createdAt,f.updated_at updatedAt,s.full_name studentName,c.name className FROM finance_records f LEFT JOIN school_users s ON s.id=f.student_id LEFT JOIN school_classes c ON c.id=f.class_id WHERE ${where.join(" AND ")} ORDER BY f.created_at DESC,f.id DESC LIMIT 500`).bind(...params).all()).results;
  if(user.role!=="admin")return Response.json({records,canManage:false});
  const [students,classes]=await Promise.all([
    env.DB.prepare("SELECT id,full_name fullName,class_name className FROM school_users WHERE role='student' ORDER BY full_name").all(),
    env.DB.prepare("SELECT id,name FROM school_classes ORDER BY name").all(),
  ]);
  return Response.json({records,canManage:true,students:students.results,classes:classes.results});
 }catch{return financeError()}
}

export async function POST(request:Request){
 try{
  const user=await session(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});if(user.role!=="admin")return Response.json({error:"Недостаточно прав"},{status:403});
  let input:CreateInput;try{input=await request.json() as CreateInput}catch{return Response.json({error:"Некорректные данные"},{status:400})}
  const title=clean(input.title,160),description=clean(input.description,2000)||null,amount=Number(input.amount),studentId=nullableId(input.studentId),classId=nullableId(input.classId),dueDate=clean(input.dueDate,40)||null,requestedPaidAt=clean(input.paidAt,40)||null;
  if(!allowedType(input.type))return Response.json({error:"Выберите тип записи"},{status:400});
  const status=allowedStatus(input.status)?input.status:"pending";
  if(!title)return Response.json({error:"Название не может быть пустым"},{status:400});
  if(!Number.isSafeInteger(amount)||amount<=0)return Response.json({error:"Сумма должна быть положительным целым числом"},{status:400});
  if(input.currency&&String(input.currency).toUpperCase()!=="KZT")return Response.json({error:"На этом этапе поддерживается только KZT"},{status:400});
  if((studentId!==null&&(!Number.isInteger(studentId)||studentId<1))||(classId!==null&&(!Number.isInteger(classId)||classId<1)))return Response.json({error:"Некорректный ученик или класс"},{status:400});
  if(!validDate(dueDate)||!validDate(requestedPaidAt))return Response.json({error:"Некорректная дата"},{status:400});
  const target=await validateFinanceTargets(studentId,classId);if("error" in target)return Response.json({error:target.error},{status:400});
  const now=new Date().toISOString(),paidAt=status==="paid"?(requestedPaidAt?new Date(requestedPaidAt).toISOString():now):null,id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO finance_records(id,type,title,description,amount,currency,status,student_id,class_id,created_by,due_date,paid_at,created_at,updated_at) VALUES(?,?,?,?,?,'KZT',?,?,?,?,?,?,?,?)").bind(id,input.type,title,description,amount,status,studentId,classId,user.id,dueDate?new Date(dueDate).toISOString():null,paidAt,now,now).run();
  return Response.json({ok:true,id},{status:201});
 }catch{return financeError()}
}
