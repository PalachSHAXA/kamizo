import type { UserRole } from './common';

// Announcement types
export type AnnouncementType = 'residents' | 'employees' | 'all';
export type AnnouncementPriority = 'normal' | 'important' | 'urgent';
export type AnnouncementTargetType = 'all' | 'branch' | 'building' | 'entrance' | 'floor' | 'custom';

// Announcement targeting
export interface AnnouncementTarget {
  type: AnnouncementTargetType;
  branchId?: string; // for branch targeting
  buildingId?: string; // for building targeting
  entrance?: string; // for entrance/подъезд targeting
  floor?: string; // for floor targeting
  customLogins?: string[]; // for custom targeting (from Excel import)
}

// File attachment for announcements
export interface FileAttachment {
  name: string;
  url: string; // data URL or external URL
  type: string; // MIME type
  size: number; // in bytes
}

// Personalized data for debt-based announcements
export interface AnnouncementPersonalizedData {
  [login: string]: {
    name: string;
    debt: number;
  };
}

// Announcement for residents or staff
export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: AnnouncementType; // 'residents' = for residents, 'employees' = for UK workers, 'all' = everyone
  priority: AnnouncementPriority;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  createdAt: string;
  expiresAt?: string; // optional expiration date
  isActive: boolean;
  viewedBy: string[]; // array of user IDs who viewed (for current user check)
  viewCount?: number; // total view count from API (for admin/manager display)
  attachments?: FileAttachment[]; // file attachments
  // Targeting fields
  target?: AnnouncementTarget;
  // Personalized data for debt-based announcements (template variables per login)
  personalizedData?: AnnouncementPersonalizedData;
}
