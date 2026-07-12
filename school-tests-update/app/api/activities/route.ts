import { env } from "cloudflare:workers";
import { ensureAccountsTable, userFromRequest } from "../../../db/accounts";

async function init(){
  await ensureAccountsTable();
  await env.DB.batch([
    env.DB.prepare("CREATE TABLE IF NOT EXISTS coin_wallets(user_id INTEGER PRIMARY KEY,balance INTEGER NOT NULL DEFAULT 0)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS coin_history(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,amount INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS assessments(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,type TEXT NOT NULL,subject TEXT NOT NULL,class_name TEXT NOT NULL,reward INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS assessment_questions(id INTEGER PRIMARY KEY AUTOINCREMENT,assessment_id INTEGER NOT NULL,question TEXT NOT NULL,options_json TEXT NOT NULL,correct_index INTEGER NOT NULL)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS assessment_attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,assessment_id INTEGER NOT NULL,student_id INTEGER NOT NULL,score INTEGER NOT NULL,total INTEGER NOT NULL,reward INTEGER NOT NULL,created_at TEXT NOT NULL,UNIQUE(assessment_id,student_id))"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS shop_items(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT NOT NULL,price INTEGER NOT NULL,stock INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1)"),
    env.DB.prepare("CREATE TABLE IF NOT EXISTS shop_orders(id INTEGER PRIMARY KEY AUTOINCREMENT,item_id INTEGER NOT NULL,student_id INTEGER NOT NULL,price INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL)"),
  ]);
}
const now=()=>new Date().toISOString();
async function payload(u:any){
  const wallet=await env.DB.prepare("SELECT balance FROM coin_wallets WHERE user_id=?").bind(u.id).first<{balance:number}>();
  const items=(await env.DB.prepare("SELECT id,name,description,price,stock FROM shop_items WHERE active=1 ORDER BY id DESC").all()).results;
  const tests=(await env.DB.prepare("SELECT a.id,a.title,a.type,a.subject,a.class_name className,a.reward,(SELECT COUNT(*) FROM assessment_questions q WHERE q.assessment_id=a.id) questionCount FROM assessments a ORDER BY a.id DESC").all()).results;
  if(u.role==="admin"){
    const students=(await env.DB.prepare("SELECT u.id,u.full_name fullName,u.class_name className,COALESCE(w.balance,0) balance FROM school_users u LEFT JOIN coin_wallets w ON w.user_id=u.id WHERE u.role='student' ORDER BY u.full_name").all()).results;
    const orders=(await env.DB.prepare("SELECT o.id,o.status,o.price,i.name itemName,u.full_name studentName FROM shop_orders o JOIN shop_items i ON i.id=o.item_id JOIN school_users u ON u.id=o.student_id ORDER BY o.id DESC").all()).results;
    const results=(await env.DB.prepare("SELECT aa.id,aa.assessment_id assessmentId,aa.score,aa.total,aa.reward,aa.created_at createdAt,u.full_name studentName,u.class_name className FROM assessment_attempts aa JOIN school_users u ON u.id=aa.student_id ORDER BY aa.id DESC").all()).results;
    return {balance:wallet?.balance??0,items,tests,students,orders,results};
  }
  const attempts=(await env.DB.prepare("SELECT assessment_id assessmentId,score,total,reward FROM assessment_attempts WHERE student_id=?").bind(u.id).all()).results;
  const history=(await env.DB.prepare("SELECT amount,reason,created_at createdAt FROM coin_history WHERE user_id=? ORDER BY id DESC LIMIT 20").bind(u.id).all()).results;
  return {balance:wallet?.balance??0,items,tests:tests.filter((x:any)=>!x.className||x.className===u.className),attempts,history};
}
export async function GET(r:Request){await init();const u=await userFromRequest(r);if(!u)return Response.json({error:"Нет доступа"},{status:401});const url=new URL(r.url),id=Number(url.searchParams.get("test"));if(id&&u.role==="student"){const test=await env.DB.prepare("SELECT id,title,type,subject,reward FROM assessments WHERE id=? AND (class_name='' OR class_name=?)").bind(id,u.className??"").first();if(!test)return Response.json({error:"Тест не найден"},{status:404});const questions=(await env.DB.prepare("SELECT id,question,options_json options FROM assessment_questions WHERE assessment_id=? ORDER BY id").bind(id).all()).results.map((q:any)=>({...q,options:JSON.parse(q.options)}));return Response.json({test,questions})}return Response.json(await payload(u));}
export async function POST(r:Request){await init();const u=await userFromRequest(r);if(!u)return Response.json({error:"Нет доступа"},{status:401});const b=await r.json() as any;
  if(u.role==="admin"&&b.action==="test"){
    const questions=Array.isArray(b.questions)?b.questions:[];if(!b.title||!b.type||questions.length===0)return Response.json({error:"Заполните тест и добавьте вопросы"},{status:400});
    const result=await env.DB.prepare("INSERT INTO assessments(title,type,subject,class_name,reward,created_at) VALUES(?,?,?,?,?,?)").bind(String(b.title).trim(),String(b.type),String(b.subject||"").trim(),String(b.className||"").trim(),Math.max(0,Number(b.reward)||0),now()).run();const id=Number(result.meta.last_row_id);
    await env.DB.batch(questions.map((q:any)=>env.DB.prepare("INSERT INTO assessment_questions(assessment_id,question,options_json,correct_index) VALUES(?,?,?,?)").bind(id,String(q.question),JSON.stringify(q.options),Number(q.correctIndex))));return Response.json(await payload(u));
  }
  if(u.role==="admin"&&b.action==="deleteTest"){
    const id=Number(b.testId);if(!id)return Response.json({error:"Испытание не найдено"},{status:400});
    await env.DB.batch([env.DB.prepare("DELETE FROM assessment_attempts WHERE assessment_id=?").bind(id),env.DB.prepare("DELETE FROM assessment_questions WHERE assessment_id=?").bind(id),env.DB.prepare("DELETE FROM assessments WHERE id=?").bind(id)]);return Response.json(await payload(u));
  }
  if(u.role==="admin"&&b.action==="item"){await env.DB.prepare("INSERT INTO shop_items(name,description,price,stock) VALUES(?,?,?,?)").bind(String(b.name).trim(),String(b.description||"").trim(),Math.max(1,Number(b.price)),Math.max(0,Number(b.stock))).run();return Response.json(await payload(u));}
  if(u.role==="admin"&&b.action==="coins"){const id=Number(b.studentId),amount=Number(b.amount);await env.DB.prepare("INSERT OR IGNORE INTO coin_wallets(user_id,balance) VALUES(?,0)").bind(id).run();await env.DB.prepare("UPDATE coin_wallets SET balance=MAX(0,balance+?) WHERE user_id=?").bind(amount,id).run();await env.DB.prepare("INSERT INTO coin_history(user_id,amount,reason,created_at) VALUES(?,?,?,?)").bind(id,amount,String(b.reason||"Начисление администратора"),now()).run();return Response.json(await payload(u));}
  if(u.role==="admin"&&b.action==="order"){await env.DB.prepare("UPDATE shop_orders SET status=? WHERE id=?").bind(String(b.status),Number(b.orderId)).run();return Response.json(await payload(u));}
  if(u.role==="student"&&b.action==="submit"){
    const test=await env.DB.prepare("SELECT reward FROM assessments WHERE id=?").bind(Number(b.testId)).first<{reward:number}>();if(!test)return Response.json({error:"Тест не найден"},{status:404});const old=await env.DB.prepare("SELECT id FROM assessment_attempts WHERE assessment_id=? AND student_id=?").bind(Number(b.testId),u.id).first();if(old)return Response.json({error:"Этот тест уже пройден"},{status:409});
    const qs=(await env.DB.prepare("SELECT id,correct_index correctIndex FROM assessment_questions WHERE assessment_id=? ORDER BY id").bind(Number(b.testId)).all()).results as any[];let score=0;qs.forEach(q=>{if(Number(b.answers?.[q.id])===q.correctIndex)score++});const earned=score===qs.length?test.reward:Math.floor(test.reward*score/qs.length);
    await env.DB.batch([env.DB.prepare("INSERT INTO assessment_attempts(assessment_id,student_id,score,total,reward,created_at) VALUES(?,?,?,?,?,?)").bind(Number(b.testId),u.id,score,qs.length,earned,now()),env.DB.prepare("INSERT OR IGNORE INTO coin_wallets(user_id,balance) VALUES(?,0)").bind(u.id),env.DB.prepare("UPDATE coin_wallets SET balance=balance+? WHERE user_id=?").bind(earned,u.id),env.DB.prepare("INSERT INTO coin_history(user_id,amount,reason,created_at) VALUES(?,?,?,?)").bind(u.id,earned,"Результат теста",now())]);return Response.json({score,total:qs.length,earned,data:await payload(u)});
  }
  if(u.role==="student"&&b.action==="buy"){
    const item=await env.DB.prepare("SELECT id,name,price,stock FROM shop_items WHERE id=? AND active=1").bind(Number(b.itemId)).first<any>();const wallet=await env.DB.prepare("SELECT balance FROM coin_wallets WHERE user_id=?").bind(u.id).first<any>();if(!item||item.stock<1)return Response.json({error:"Товар закончился"},{status:400});if((wallet?.balance??0)<item.price)return Response.json({error:"Недостаточно монет"},{status:400});await env.DB.batch([env.DB.prepare("UPDATE coin_wallets SET balance=balance-? WHERE user_id=?").bind(item.price,u.id),env.DB.prepare("UPDATE shop_items SET stock=stock-1 WHERE id=? AND stock>0").bind(item.id),env.DB.prepare("INSERT INTO shop_orders(item_id,student_id,price,status,created_at) VALUES(?,?,?,'pending',?)").bind(item.id,u.id,item.price,now()),env.DB.prepare("INSERT INTO coin_history(user_id,amount,reason,created_at) VALUES(?,?,?,?)").bind(u.id,-item.price,"Покупка: "+item.name,now())]);return Response.json(await payload(u));
  }
  return Response.json({error:"Недопустимое действие"},{status:403});
}
