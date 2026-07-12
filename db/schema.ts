import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
export const schoolUsers = sqliteTable("school_users", {
  id: integer("id").primaryKey({ autoIncrement: true }), email: text("email").unique(), username: text("username").unique(),
  fullName: text("full_name").notNull(), role: text("role", { enum: ["admin", "teacher", "student"] }).notNull(),
  className: text("class_name"), createdAt: text("created_at").notNull(), passwordHash:text("password_hash"),passwordSalt:text("password_salt"),mustChangePassword:integer("must_change_password").notNull().default(1),
});
export const schoolSessions=sqliteTable("school_sessions",{tokenHash:text("token_hash").primaryKey(),userId:integer("user_id").notNull(),expiresAt:text("expires_at").notNull(),createdAt:text("created_at").notNull()});
export const schoolClasses=sqliteTable("school_classes",{id:integer("id").primaryKey({autoIncrement:true}),name:text("name").notNull().unique()});
export const schoolSubjects=sqliteTable("school_subjects",{id:integer("id").primaryKey({autoIncrement:true}),name:text("name").notNull().unique()});
export const teachingAssignments=sqliteTable("teaching_assignments",{id:integer("id").primaryKey({autoIncrement:true}),teacherId:integer("teacher_id").notNull(),classId:integer("class_id").notNull(),subjectId:integer("subject_id").notNull()});
export const grades=sqliteTable("grades",{id:integer("id").primaryKey({autoIncrement:true}),studentId:integer("student_id").notNull(),assignmentId:integer("assignment_id").notNull(),value:integer("value").notNull(),createdAt:text("created_at").notNull()});
export const scheduleLessons=sqliteTable("schedule_lessons",{id:integer("id").primaryKey({autoIncrement:true}),day:integer("day").notNull(),startTime:text("start_time").notNull(),endTime:text("end_time").notNull(),classId:integer("class_id").notNull(),subjectId:integer("subject_id").notNull(),teacherId:integer("teacher_id").notNull(),room:text("room").notNull()});
