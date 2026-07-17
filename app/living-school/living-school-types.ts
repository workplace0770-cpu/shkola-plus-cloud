export type TimeOfDay = "morning" | "day" | "evening" | "night";

export type LivingSchoolAtmosphere =
  | "calm"
  | "inspired"
  | "active"
  | "celebrating";

export type LivingSchoolSnapshot = {
  activeStudentsToday: number;
  activeTeachersToday: number;
  positiveGradesToday: number;
  positiveEventsToday: number;
  weeklyAchievements: number;
  schoolEnergy: number;
  knowledgeTreeLevel: number;
  knowledgeTreeLeaves: number;
  knowledgeTreeGoldenFlowers: number;
  knowledgeTreeProgress: number;
  atmosphere: LivingSchoolAtmosphere;
  generatedAt: string;
  dataMode: "live" | "partial";
};

export type SchoolEvent = {
  id: string;
  title: string;
};
