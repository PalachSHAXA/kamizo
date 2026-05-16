// Sprint 27: shared types between ColleaguesSection and its split-
// out child files (RatingModal, ThankModal, EmployeeProfile,
// NewsFeed, TopColleagues, EmployeeRow). Lives here so each child
// imports types from a flat module instead of the parent page.

export interface Employee {
  id: string;
  name: string;
  position: string;
  department: string;
  photo: string;
  ratings: {
    professionalKnowledge: number;
    legislationKnowledge: number;
    analyticalSkills: number;
    qualityOfWork: number;
    execution: number;
    reliability: number;
    teamwork: number;
    communication: number;
    initiative: number;
    humanity: number;
  };
  totalRatings: number;
  monthlyRatings: number;
  badges: string[];
}

export interface Rating {
  id: string;
  raterId: string;
  targetId: string;
  month: number;
  year: number;
  ratings: Employee['ratings'];
  comment: string;
  createdAt: string;
}

export interface Thank {
  id: string;
  fromId: string;
  fromName?: string;
  toId: string;
  reason: string;
  isAnonymous: boolean;
  createdAt: string;
}

export interface NewsItem {
  id: string;
  type: 'top' | 'thank' | 'department';
  text: string;
  createdAt: string;
}
