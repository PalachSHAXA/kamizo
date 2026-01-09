export interface User {
  id: number;
  login: string;
  name: string;
  role: 'admin' | 'manager' | 'executor' | 'resident' | 'tenant' | 'commercial_owner';
  specialization?: string;
  phone?: string;
  apartmentId?: number;
}

export interface Employee {
  id: number;
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
  id: number;
  raterId: number;
  targetId: number;
  month: number;
  year: number;
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
  comment: string;
  createdAt: string;
}

export interface Thank {
  id: number;
  fromId: number;
  fromName?: string;
  toId: number;
  reason: string;
  isAnonymous: boolean;
  createdAt: string;
}

export interface Request {
  id: number;
  residentId: number;
  apartmentId: number;
  category: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: string;
  createdAt: string;
  executorId?: number;
  photos?: string[];
}
