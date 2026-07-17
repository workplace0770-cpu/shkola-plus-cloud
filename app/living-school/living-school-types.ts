export type TimeOfDay = "morning" | "day" | "evening" | "night";

export type LivingSchoolAtmosphere =
  | "calm"
  | "inspired"
  | "active"
  | "celebrating";

export type LivingSchoolSnapshot = {
  activeStudents: number;
  activeTeachers: number;
  positiveEventsToday: number;
  weeklyAchievements: number;
  schoolEnergy: number;
  knowledgeTreeLevel: number;
  knowledgeTreeLeaves: number;
  knowledgeTreeGoldenFlowers: number;
  knowledgeTreeProgress: number;
  atmosphere: LivingSchoolAtmosphere;
};

export type SchoolEvent = {
  id: string;
  title: string;
};

