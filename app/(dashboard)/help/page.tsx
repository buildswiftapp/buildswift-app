'use client'

import { useState } from 'react'
import {
  Search,
  FileQuestion,
  FileCheck,
  FilePen,
  FolderKanban,
  Users,
  CreditCard,
  Sparkles,
  ChevronDown,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const helpCategories = [
  {
    icon: FolderKanban,
    title: 'Projects',
    description: 'Learn how to create and manage projects',
    articles: 5,
  },
  {
    icon: FileQuestion,
    title: 'RFIs',
    description: 'Create and track Requests for Information',
    articles: 8,
  },
  {
    icon: FileCheck,
    title: 'Submittals',
    description: 'Manage product and material submittals',
    articles: 6,
  },
  {
    icon: FilePen,
    title: 'Change Orders',
    description: 'Handle contract modifications',
    articles: 4,
  },
  {
    icon: Users,
    title: 'Team Management',
    description: 'Invite and manage team members',
    articles: 3,
  },
  {
    icon: Sparkles,
    title: 'AI Features',
    description: 'Use AI to generate documents',
    articles: 5,
  },
]

const faqs = [
  {
    question: 'How do I create a new RFI?',
    answer:
      'To create a new RFI, navigate to Documents > New Document, select "RFI" as the document type, choose your project, and fill in the required information. You can also use AI Generate to create a draft based on your description.',
  },
  {
    question: 'How does the AI document generation work?',
    answer:
      'Our AI uses advanced language models to generate professional construction documents. Simply describe what you need, select the document type and project, and the AI will create a draft. You can then review and edit the content before submitting.',
  },
  {
    question: 'What are the document status meanings?',
    answer:
      'Documents go through several statuses: Draft (initial creation), Pending Review (submitted for approval), Approved (accepted), Rejected (declined), and Revision Requested (needs changes). Each status helps track where a document is in the review process.',
  },
  {
    question: 'How do I invite team members?',
    answer:
      'Go to Team from the sidebar, click "Invite Member", enter their email address, and send the invitation. They will receive an email with instructions to join your team.',
  },
  {
    question: 'What is included in each subscription plan?',
    answer:
      'The Free plan includes 25 documents and 10 AI generations per month. Professional adds up to 500 documents, 100 AI generations, unlimited projects, and team collaboration. Enterprise offers unlimited documents, AI generations, custom templates, SSO, and dedicated support.',
  },
  {
    question: 'Can I export my documents?',
    answer:
      'Yes, you can export documents to PDF format from the document detail view. You can also download all documents for a project as a bundled archive.',
  },
  {
    question: 'How do I change my subscription plan?',
    answer:
      'Navigate to Billing from the sidebar, review the available plans, and click "Upgrade" or "Downgrade" on your desired plan. Payment changes will be prorated based on your billing cycle.',
  },
  {
    question: 'What happens when I reach my document limit?',
    answer:
      'You will receive a notification when approaching your limit. Once reached, you can still view existing documents but cannot create new ones until the next billing cycle or by upgrading your plan.',
  },
]

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredFaqs = faqs.filter(
    (faq) =>
      faq.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      faq.answer.toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className="flex flex-col">
      <div className="flex-1 space-y-8 p-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-bold">How can we help you?</h1>
          <p className="mt-2 text-muted-foreground">
            Search our help center or browse categories below
          </p>
          <div className="relative mt-6">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search for help..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 pl-12 text-lg"
            />
          </div>
        </div>

        <div>
          <h2 className="mb-4 text-lg font-semibold">Browse by Category</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {helpCategories.map((category) => (
              <Card
                key={category.title}
                className="cursor-pointer transition-shadow hover:shadow-md"
              >
                <CardContent className="flex items-start gap-4 pt-6">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                    <category.icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{category.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      {category.description}
                    </p>
                    <p className="mt-1 text-sm text-primary">
                      {category.articles} articles
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
            <CardDescription>
              Quick answers to common questions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              {filteredFaqs.map((faq, index) => (
                <AccordionItem key={index} value={`item-${index}`}>
                  <AccordionTrigger className="text-left">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
            {filteredFaqs.length === 0 && (
              <p className="py-8 text-center text-muted-foreground">
                No FAQs found matching your search
              </p>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
