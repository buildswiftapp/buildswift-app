import type {
  User,
  Company,
  Project,
  Document,
  Review,
  Notification,
  ActivityLog,
} from './types'

export const mockUser: User = {
  id: 'user-1',
  email: 'john.davis@buildco.com',
  name: 'John Davis',
  role: 'admin',
  avatar: undefined,
  companyId: 'company-1',
  createdAt: '2024-01-15T08:00:00Z',
}

export const mockCompany: Company = {
  id: 'company-1',
  name: 'BuildCo Construction',
  subscriptionTier: 'free',
  documentsUsed: 0,
  documentsLimit: 25,
  aiGenerationsUsed: 0,
  aiGenerationsLimit: 10,
  createdAt: '2024-01-01T00:00:00Z',
}

export const mockProjects: Project[] = [
  {
    id: 'proj-1',
    projectNumber: 'TC-001',
    name: 'Tech Center Office Build',
    description: 'Modern office building with state-of-the-art facilities and sustainable design features.',
    companyId: 'company-1',
    status: 'active',
    address: '123 Main Street, Salt Lake City, UT',
    clientName: 'Tech Ventures Inc',
    startDate: '2024-02-01',
    endDate: '2026-06-30',
    documentsCount: 45,
    teamMembers: ['user-1', 'user-2', 'user-3'],
    createdAt: '2024-01-20T10:00:00Z',
    updatedAt: '2024-03-15T14:30:00Z',
  },
  {
    id: 'proj-2',
    projectNumber: 'HV-002',
    name: 'Harbor View Apartments',
    description: 'Luxury waterfront residential complex with 200 units across three buildings.',
    companyId: 'company-1',
    status: 'active',
    address: '500 Harbor Drive, Miami, FL 33101',
    clientName: 'Coastal Living Developers',
    startDate: '2024-03-15',
    endDate: '2025-12-31',
    documentsCount: 32,
    teamMembers: ['user-1', 'user-4'],
    createdAt: '2024-03-01T09:00:00Z',
    updatedAt: '2024-03-20T11:00:00Z',
  },
  {
    id: 'proj-3',
    projectNumber: 'GV-003',
    name: 'Green Valley Medical Center',
    description: 'State-of-the-art medical facility with emergency services and specialized care units.',
    companyId: 'company-1',
    status: 'on_hold',
    address: '789 Health Park Way, Austin, TX 78701',
    clientName: 'Texas Health Systems',
    startDate: '2024-01-10',
    documentsCount: 28,
    teamMembers: ['user-2', 'user-3'],
    createdAt: '2024-01-05T08:00:00Z',
    updatedAt: '2024-02-28T16:00:00Z',
  },
  {
    id: 'proj-4',
    projectNumber: 'RS-004',
    name: 'Riverside Shopping Mall',
    description: 'Regional shopping center with entertainment venues and dining options.',
    companyId: 'company-1',
    status: 'completed',
    address: '2000 Commerce Blvd, Denver, CO 80202',
    clientName: 'Retail Ventures LLC',
    startDate: '2023-06-01',
    endDate: '2024-01-31',
    documentsCount: 89,
    teamMembers: ['user-1', 'user-2', 'user-3', 'user-4'],
    createdAt: '2023-05-15T10:00:00Z',
    updatedAt: '2024-02-01T09:00:00Z',
  },
]

export const mockDocuments: Document[] = [
  {
    id: 'doc-1',
    projectId: 'proj-1',
    type: 'rfi',
    title: 'Structural Steel Connection Details',
    content: `<h2>Request for Information</h2>
<p><strong>RFI Number:</strong> RFI-001</p>
<p><strong>Date:</strong> March 15, 2024</p>
<p><strong>Subject:</strong> Clarification on Structural Steel Connection Details at Grid Lines A-5 and B-7</p>

<h3>Question:</h3>
<p>The structural drawings (S-201, S-202) show moment connections at the beam-column intersections at grid lines A-5 and B-7. However, the connection details on sheet S-501 appear to show simple shear connections for the same locations.</p>

<p>Please clarify which connection type should be used and provide updated details if necessary.</p>

<h3>Impact if Not Resolved:</h3>
<ul>
<li>Steel fabrication delayed by 2-3 weeks</li>
<li>Potential cost increase for redesign</li>
<li>Schedule impact to subsequent trades</li>
</ul>

<h3>Suggested Resolution:</h3>
<p>Review structural calculations and confirm moment connection requirement per the structural analysis. Update sheet S-501 accordingly.</p>`,
    status: 'pending_review',
    version: 1,
    createdBy: 'user-1',
    createdAt: '2024-03-15T09:00:00Z',
    updatedAt: '2024-03-15T14:30:00Z',
    dueDate: '2024-03-22',
    metadata: {
      question: 'Clarification needed on structural steel connection type at specified grid lines.',
      responseRequired: true,
      priority: 'high',
      tags: ['structural', 'steel', 'connections'],
    },
  },
  {
    id: 'doc-2',
    projectId: 'proj-1',
    type: 'submittal',
    title: 'HVAC Equipment - Rooftop Units',
    content: `<h2>Product Submittal</h2>
<p><strong>Submittal Number:</strong> SUB-015</p>
<p><strong>Date:</strong> March 18, 2024</p>
<p><strong>Specification Section:</strong> 23 74 00 - Packaged Outdoor HVAC Equipment</p>

<h3>Product Information:</h3>
<p><strong>Manufacturer:</strong> Carrier Corporation</p>
<p><strong>Model:</strong> 48TC Series Commercial Rooftop Units</p>
<p><strong>Capacity:</strong> 25-ton cooling capacity</p>

<h3>Compliance Statement:</h3>
<p>The submitted equipment meets or exceeds all specifications outlined in Section 23 74 00, including:</p>
<ul>
<li>Energy efficiency requirements (SEER 16+)</li>
<li>Sound level specifications (max 75 dB)</li>
<li>Filter efficiency (MERV 13)</li>
<li>BMS integration capability</li>
</ul>

<h3>Attachments:</h3>
<ul>
<li>Product data sheets</li>
<li>Performance curves</li>
<li>Electrical requirements</li>
<li>Installation details</li>
<li>Warranty information</li>
</ul>`,
    status: 'approved',
    version: 2,
    createdBy: 'user-2',
    createdAt: '2024-03-18T11:00:00Z',
    updatedAt: '2024-03-20T16:00:00Z',
    metadata: {
      specSection: '23 74 00',
      manufacturer: 'Carrier Corporation',
      productName: '48TC Series Commercial Rooftop Units',
      priority: 'medium',
      tags: ['HVAC', 'mechanical', 'rooftop-units'],
    },
  },
  {
    id: 'doc-3',
    projectId: 'proj-1',
    type: 'change_order',
    title: 'Foundation Modification - Additional Piles',
    content: `<h2>Change Order Request</h2>
<p><strong>Change Order Number:</strong> CO-007</p>
<p><strong>Date:</strong> March 20, 2024</p>
<p><strong>Contract:</strong> General Construction Services</p>

<h3>Description of Change:</h3>
<p>Geotechnical investigation revealed unforeseen soil conditions in the northeast corner of the building footprint. Additional deep foundation elements are required to achieve the specified bearing capacity.</p>

<h3>Scope of Work:</h3>
<ul>
<li>Installation of 8 additional driven steel piles (HP14x73)</li>
<li>Modified pile cap design at grid lines D-8 through D-10</li>
<li>Additional excavation and backfill</li>
<li>Revised structural connections</li>
</ul>

<h3>Cost Impact:</h3>
<table>
<tr><td>Additional Piles</td><td>$124,000</td></tr>
<tr><td>Modified Pile Caps</td><td>$38,500</td></tr>
<tr><td>Excavation/Backfill</td><td>$12,200</td></tr>
<tr><td>Engineering Redesign</td><td>$8,500</td></tr>
<tr><td><strong>Total</strong></td><td><strong>$183,200</strong></td></tr>
</table>

<h3>Schedule Impact:</h3>
<p>Estimated 12 working days addition to foundation phase. Critical path analysis indicates potential 8-day impact to overall project completion.</p>`,
    status: 'draft',
    version: 1,
    createdBy: 'user-1',
    createdAt: '2024-03-20T10:00:00Z',
    updatedAt: '2024-03-20T15:00:00Z',
    metadata: {
      contractAmount: 12500000,
      proposedAmount: 183200,
      reason: 'Unforeseen soil conditions requiring additional foundation work',
      priority: 'urgent',
      tags: ['foundation', 'geotechnical', 'structural'],
    },
  },
  {
    id: 'doc-4',
    projectId: 'proj-2',
    type: 'rfi',
    title: 'Window System Specification Clarification',
    content: `<h2>Request for Information</h2>
<p><strong>RFI Number:</strong> RFI-008</p>
<p><strong>Date:</strong> March 19, 2024</p>

<h3>Question:</h3>
<p>The architectural specifications call for hurricane-rated windows with a DP rating of 75, but the window schedule shows units with DP 65. Please confirm the required performance rating.</p>`,
    status: 'pending_review',
    version: 1,
    createdBy: 'user-1',
    createdAt: '2024-03-19T14:00:00Z',
    updatedAt: '2024-03-19T14:00:00Z',
    dueDate: '2024-03-26',
    metadata: {
      question: 'Confirm hurricane window DP rating requirement',
      responseRequired: true,
      priority: 'high',
      tags: ['windows', 'hurricane', 'specifications'],
    },
  },
  {
    id: 'doc-5',
    projectId: 'proj-2',
    type: 'submittal',
    title: 'Exterior Paint System',
    content: `<h2>Product Submittal</h2>
<p><strong>Submittal Number:</strong> SUB-022</p>

<h3>Product Information:</h3>
<p><strong>Manufacturer:</strong> Sherwin-Williams</p>
<p><strong>System:</strong> Duration Exterior Acrylic Latex</p>`,
    status: 'revision_requested',
    version: 1,
    createdBy: 'user-4',
    createdAt: '2024-03-17T09:00:00Z',
    updatedAt: '2024-03-19T11:00:00Z',
    metadata: {
      specSection: '09 91 00',
      manufacturer: 'Sherwin-Williams',
      productName: 'Duration Exterior System',
      priority: 'low',
      tags: ['paint', 'exterior', 'finishes'],
    },
  },
]

export const mockReviews: Review[] = [
  {
    id: 'review-1',
    documentId: 'doc-1',
    reviewerId: 'user-2',
    status: 'pending',
    comments: '',
    createdAt: '2024-03-15T15:00:00Z',
    updatedAt: '2024-03-15T15:00:00Z',
  },
  {
    id: 'review-2',
    documentId: 'doc-2',
    reviewerId: 'user-1',
    status: 'approved',
    comments: 'Equipment meets specifications. Approved for procurement.',
    createdAt: '2024-03-18T12:00:00Z',
    updatedAt: '2024-03-20T16:00:00Z',
  },
  {
    id: 'review-3',
    documentId: 'doc-5',
    reviewerId: 'user-1',
    status: 'revision_requested',
    comments: 'Please provide color samples and confirm VOC compliance for coastal environment.',
    createdAt: '2024-03-17T10:00:00Z',
    updatedAt: '2024-03-19T11:00:00Z',
  },
]

export const mockNotifications: Notification[] = [
  {
    id: 'notif-1',
    userId: 'user-1',
    type: 'review_request',
    title: 'Review Requested',
    message: 'You have been assigned to review "Structural Steel Connection Details"',
    read: false,
    link: '/documents/doc-1',
    createdAt: '2024-03-15T15:00:00Z',
  },
  {
    id: 'notif-2',
    userId: 'user-1',
    type: 'deadline',
    title: 'Deadline Approaching',
    message: 'RFI-001 response is due in 3 days',
    read: false,
    link: '/documents/doc-1',
    createdAt: '2024-03-19T08:00:00Z',
  },
  {
    id: 'notif-3',
    userId: 'user-1',
    type: 'comment',
    title: 'New Comment',
    message: 'Sarah Johnson commented on "HVAC Equipment - Rooftop Units"',
    read: true,
    link: '/documents/doc-2',
    createdAt: '2024-03-18T16:30:00Z',
  },
]

export const mockActivityLog: ActivityLog[] = [
  {
    id: 'activity-1',
    projectId: 'proj-1',
    documentId: 'doc-3',
    userId: 'user-1',
    action: 'document_created',
    details: 'Created change order "Foundation Modification - Additional Piles"',
    createdAt: '2024-03-20T10:00:00Z',
  },
  {
    id: 'activity-2',
    projectId: 'proj-1',
    documentId: 'doc-2',
    userId: 'user-1',
    action: 'review_approved',
    details: 'Approved submittal "HVAC Equipment - Rooftop Units"',
    createdAt: '2024-03-20T16:00:00Z',
  },
  {
    id: 'activity-3',
    projectId: 'proj-2',
    documentId: 'doc-5',
    userId: 'user-1',
    action: 'revision_requested',
    details: 'Requested revision on "Exterior Paint System"',
    createdAt: '2024-03-19T11:00:00Z',
  },
]

export const mockTeamMembers: User[] = [
  mockUser,
  {
    id: 'user-2',
    email: 'sarah.johnson@buildco.com',
    name: 'Sarah Johnson',
    role: 'admin',
    companyId: 'company-1',
    createdAt: '2024-01-10T08:00:00Z',
  },
  {
    id: 'user-3',
    email: 'mike.chen@buildco.com',
    name: 'Mike Chen',
    role: 'team_member',
    companyId: 'company-1',
    createdAt: '2024-02-01T08:00:00Z',
  },
  {
    id: 'user-4',
    email: 'emily.davis@buildco.com',
    name: 'Emily Davis',
    role: 'team_member',
    companyId: 'company-1',
    createdAt: '2024-02-15T08:00:00Z',
  },
]
