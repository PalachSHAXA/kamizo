// Sprint 26: shared types for WorkOrdersPage and its split-out modal
// children. The interface lived inline at the top of the page file;
// moved here so DetailModal / FormModal can import it without a
// circular dep with the parent.

export type WorkOrderStatus = 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
export type WorkOrderPriority = 'low' | 'medium' | 'high' | 'urgent';
export type WorkOrderType = 'planned' | 'preventive' | 'emergency' | 'seasonal';

export interface WorkOrder {
  id: string;
  number: string;
  title: string;
  description: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;

  buildingId: string;
  apartmentId?: string;

  assignedTo?: string;
  assignedTeam?: string[];

  scheduledDate?: string;
  scheduledTime?: string;
  startedAt?: string;
  completedAt?: string;

  estimatedDuration: number; // minutes
  actualDuration?: number;

  materials?: { name: string; quantity: number; unit: string }[];
  checklist?: { item: string; completed: boolean }[];
  photos?: string[];

  requestId?: string;

  notes?: string;
  createdAt: string;
  updatedAt: string;
}
