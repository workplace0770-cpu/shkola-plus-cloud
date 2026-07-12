import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../db/accounts";
import { chatError, ensureChatsTables } from "../../../db/chats";

export async function GET(r:Request){
 try{
  await ensureAccountsTable();await ensureChatsTables();const u=await userFromRequest(r);
  if(!u)return Response.json({error:"Требуется вход"},{status:401});
  const chats=(await env.DB.prepare(`SELECT c.id,c.type,c.title,c.updated_at updatedAt,
   (SELECT body FROM messages m WHERE m.chat_id=c.id AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1) lastMessage,
   (SELECT created_at FROM messages m WHERE m.chat_id=c.id AND m.deleted_at IS NULL ORDER BY m.id DESC LIMIT 1) lastMessageAt
   FROM chats c JOIN chat_members cm ON cm.chat_id=c.id WHERE cm.user_id=? ORDER BY c.updated_at DESC`).bind(u.id).all()).results;
  let contacts:any[]=[];
  if(u.role==="admin")contacts=(await env.DB.prepare("SELECT id,full_name fullName,role,class_name className FROM school_users WHERE id<>? ORDER BY full_name").bind(u.id).all()).results;
  else if(u.role==="teacher")contacts=(await env.DB.prepare("SELECT id,full_name fullName,role,class_name className FROM school_users WHERE role='student' ORDER BY full_name").all()).results;
  return Response.json({chats,contacts,canCreate:u.role!=="student"});
 }catch{return chatError()}
}

export async function POST(r:Request){
 try{
  await ensureAccountsTable();await ensureChatsTables();const u=await userFromRequest(r);
  if(!u)return Response.json({error:"Требуется вход"},{status:401});
  if(u.role==="student")return Response.json({error:"Ученики могут отвечать только в существующих чатах"},{status:403});
  const body=await r.json() as {targetUserId?:number},targetId=Number(body.targetUserId);
  if(!targetId||targetId===u.id)return Response.json({error:"Выберите пользователя"},{status:400});
  const target=await env.DB.prepare("SELECT id,full_name fullName,role FROM school_users WHERE id=?").bind(targetId).first<{id:number;fullName:string;role:string}>();
  if(!target)return Response.json({error:"Пользователь не найден"},{status:404});
  if(u.role==="teacher"&&target.role!=="student")return Response.json({error:"Учитель может создать чат только с учеником"},{status:403});
  const existing=await env.DB.prepare(`SELECT c.id FROM chats c
   JOIN chat_members a ON a.chat_id=c.id AND a.user_id=?
   JOIN chat_members b ON b.chat_id=c.id AND b.user_id=?
   WHERE c.type='direct' AND (SELECT COUNT(*) FROM chat_members x WHERE x.chat_id=c.id)=2 LIMIT 1`).bind(u.id,targetId).first<{id:number}>();
  if(existing)return Response.json({id:existing.id},{status:200});
  const now=new Date().toISOString(),title=`${u.fullName} — ${target.fullName}`,created=await env.DB.prepare("INSERT INTO chats(type,title,class_id,created_by,created_at,updated_at) VALUES('direct',?,NULL,?,?,?)").bind(title,u.id,now,now).run(),id=Number(created.meta.last_row_id);
  await env.DB.batch([env.DB.prepare("INSERT INTO chat_members(chat_id,user_id,role,joined_at) VALUES(?,?,'owner',?)").bind(id,u.id,now),env.DB.prepare("INSERT INTO chat_members(chat_id,user_id,role,joined_at) VALUES(?,?,'member',?)").bind(id,targetId,now)]);
  return Response.json({id},{status:201});
 }catch{return chatError()}
}
