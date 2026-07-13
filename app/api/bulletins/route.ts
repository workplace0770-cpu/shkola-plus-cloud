import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../db/accounts";
import { ensureBulletins } from "../../../db/bulletins";
import { notify } from "../../../db/notifications";

type BulletinInput = { kind?: "announcement"|"event"; title?:string; body?:string; audience?:"all"|"students"|"teachers"|"class"; targetClass?:string|null; eventAt?:string|null };
async function prepare(request:Request){await ensureAccountsTable();await ensureBulletins();return userFromRequest(request)}
function clean(value:unknown,max:number){return String(value??"").trim().slice(0,max)}

export async function GET(request:Request){
  const user=await prepare(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});
  const where=user.role==="admin"?"1=1":"(b.audience='all' OR b.audience=? OR (b.audience='class' AND b.target_class=?))";
  const query=env.DB.prepare(`SELECT b.id,b.kind,b.title,b.body,b.audience,b.target_class targetClass,b.event_at eventAt,b.created_at createdAt,b.updated_at updatedAt,COALESCE(u.full_name,'Администрация') authorName FROM school_bulletins b LEFT JOIN school_users u ON u.id=b.created_by WHERE ${where} ORDER BY CASE WHEN b.kind='event' AND b.event_at>=? THEN 0 ELSE 1 END,CASE WHEN b.kind='event' THEN b.event_at ELSE b.created_at END DESC,b.id DESC`);
  const now=new Date().toISOString(),items=user.role==="admin"?(await query.bind(now).all()).results:(await query.bind(user.role==="student"?"students":"teachers",user.className??"",now).all()).results;
  const classes=user.role==="admin"?(await env.DB.prepare("SELECT DISTINCT class_name name FROM school_users WHERE role='student' AND class_name IS NOT NULL AND trim(class_name)<>'' ORDER BY class_name").all()).results:[];
  return Response.json({items,classes,canManage:user.role==="admin"});
}

export async function POST(request:Request){
  const user=await prepare(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});if(user.role!=="admin")return Response.json({error:"Недостаточно прав"},{status:403});
  let input:BulletinInput;try{input=await request.json()as BulletinInput}catch{return Response.json({error:"Некорректные данные"},{status:400})}
  const kind=input.kind==="event"?"event":"announcement",audience=["all","students","teachers","class"].includes(String(input.audience))?String(input.audience):"all",title=clean(input.title,120),body=clean(input.body,3000),targetClass=audience==="class"?clean(input.targetClass,40):null,eventAt=kind==="event"?clean(input.eventAt,40):null;
  if(title.length<3||body.length<3)return Response.json({error:"Заполните заголовок и текст"},{status:400});if(audience==="class"&&!targetClass)return Response.json({error:"Выберите класс"},{status:400});if(kind==="event"&&(!eventAt||Number.isNaN(Date.parse(eventAt))))return Response.json({error:"Укажите дату события"},{status:400});
  const now=new Date().toISOString(),created=await env.DB.prepare("INSERT INTO school_bulletins(kind,title,body,audience,target_class,event_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(kind,title,body,audience,targetClass,eventAt?new Date(eventAt).toISOString():null,user.id,now,now).run();
  const recipients=audience==="class"?(await env.DB.prepare("SELECT id FROM school_users WHERE role='student' AND class_name=?").bind(targetClass).all<{id:number}>()).results:audience==="all"?(await env.DB.prepare("SELECT id FROM school_users WHERE id<>?").bind(user.id).all<{id:number}>()).results:(await env.DB.prepare(`SELECT id FROM school_users WHERE role=?`).bind(audience==="students"?"student":"teacher").all<{id:number}>()).results;
  await Promise.all(recipients.map(recipient=>notify(recipient.id,kind,kind==="event"?`Новое событие: ${title}`:title,body.slice(0,180),"bulletins")));
  return Response.json({ok:true,id:Number(created.meta.last_row_id)},{status:201});
}

export async function DELETE(request:Request){const user=await prepare(request);if(!user)return Response.json({error:"Требуется вход"},{status:401});if(user.role!=="admin")return Response.json({error:"Недостаточно прав"},{status:403});const id=Number(new URL(request.url).searchParams.get("id"));if(!Number.isInteger(id)||id<1)return Response.json({error:"Некорректная запись"},{status:400});await env.DB.prepare("DELETE FROM school_bulletins WHERE id=?").bind(id).run();return Response.json({ok:true})}
