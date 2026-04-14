export type SubscriptionTier = 'free' | 'professional' | 'enterprise'
export type DocumentType = 'rfi' | 'submittal' | 'change_order'
export type DocumentStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'revision_requested'
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'revision_requested'

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  companyId: string
  createdAt: string
  role?: string
}

export interface Company {
  id: string
  name: string
  subscriptionTier: SubscriptionTier
  documentsUsed: number
  documentsLimit: number
  aiGenerationsUsed: number
  aiGenerationsLimit: number
  createdAt: string
}

export interface Project {
  id: string
  projectNumber?: string
  name: string
  description: string
  companyId: string
  status: 'active' | 'completed' | 'on_hold'
  address?: string
  clientName?: string
  startDate: string
  endDate?: string
  documentsCount: number
  teamMembers: string[]
  createdAt: string
  updatedAt: string
}

export interface Document {
  id: string
  projectId: string
  type: DocumentType
  title: string
  content: string
  status: DocumentStatus
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
  dueDate?: string
  metadata: DocumentMetadata
}

export interface DocumentMetadata {
  question?: string
  responseRequired?: boolean

  specSection?: string
  manufacturer?: string
  productName?: string

  contractAmount?: number
  proposedAmount?: number
  reason?: string
  changeOrderNumber?: string
  changeOrderDate?: string
  scheduleImpact?: string
  notes?: string

  priority?: 'low' | 'medium' | 'high' | 'urgent'
  tags?: string[]
  attachments?: Attachment[]
}

export interface Attachment {
  id: string
  name: string
  url: string
  size: number
  type: string
}

export interface Review {
  id: string
  documentId: string
  reviewerId: string
  status: ReviewStatus
  comments: string
  createdAt: string
  updatedAt: string
}

export interface Comment {
  id: string
  documentId: string
  userId: string
  content: string
  createdAt: string
  parentId?: string
}

export interface ActivityLog {
  id: string
  projectId: string
  documentId?: string
  userId: string
  action: string
  details: string
  createdAt: string
}

export interface Notification {
  id: string
  userId: string
  type: 'review_request' | 'review_complete' | 'comment' | 'mention' | 'deadline'
  title: string
  message: string
  read: boolean
  link?: string
  createdAt: string
}

export interface SubscriptionPlan {
  id: string
  name: string
  tier: SubscriptionTier
  price: number
  documentsLimit: number
  aiGenerationsLimit: number
  features: string[]
}
