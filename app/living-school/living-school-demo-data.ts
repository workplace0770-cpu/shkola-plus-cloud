import type { LivingSchoolSnapshot, SchoolEvent } from "./living-school-types";

// Stage 1 only: these values are intentionally local demo data.
export const livingSchoolDemoSnapshot: LivingSchoolSnapshot = {
  activeStudents: 96,
  activeTeachers: 14,
  positiveEventsToday: 128,
  weeklyAchievements: 23,
  schoolEnergy: 82,
  knowledgeTreeLevel: 4,
  knowledgeTreeLeaves: 1248,
  knowledgeTreeGoldenFlowers: 17,
  knowledgeTreeProgress: 68,
  atmosphere: "inspired",
};

export const livingSchoolDemoEvents: SchoolEvent[] = [
  { id: "achievement", title: "Школа получила новое достижение" },
  { id: "olympiad", title: "Ученик победил в олимпиаде" },
  { id: "project", title: "Класс завершил большой проект" },
  { id: "birthday", title: "Сегодня день рождения ученика" },
  { id: "grades", title: "Ученики получили 100 хороших оценок" },
  { id: "tradition", title: "Открыта новая школьная традиция" },
];

