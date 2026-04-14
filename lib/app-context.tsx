'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { User, Company, Project, Document, Notification } from './types'
import {
  mockUser,
  mockCompany,
  mockProjects,
  mockDocuments,
  mockNotifications,
} from './mock-data'

interface AppContextType {
  user: User | null
  company: Company | null
  projects: Project[]
  documents: Document[]
  notifications: Notification[]
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<boolean>
  logout: () => void
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'documentsCount'>) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  addDocument: (document: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => void
  updateDocument: (id: string, updates: Partial<Document>) => void
  deleteDocument: (id: string) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
}

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(mockUser)
  const [company, setCompany] = useState<Company | null>(mockCompany)
  const [projects, setProjects] = useState<Project[]>(mockProjects)
  const [documents, setDocuments] = useState<Document[]>(mockDocuments)
  const [notifications, setNotifications] = useState<Notification[]>(mockNotifications)
  const [isAuthenticated, setIsAuthenticated] = useState(true)

  const login = useCallback(async (email: string, _password: string): Promise<boolean> => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    if (email) {
      setUser(mockUser)
      setCompany(mockCompany)
      setIsAuthenticated(true)
      return true
    }
    return false
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setCompany(null)
    setIsAuthenticated(false)
  }, [])

  const addProject = useCallback(
    (projectData: Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'documentsCount'>) => {
      const newProject: Project = {
        ...projectData,
        id: `project-${Date.now()}`,
        documentsCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setProjects((prev) => [...prev, newProject])
    },
    []
  )

  const updateProject = useCallback((id: string, updates: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
      )
    )
  }, [])

  const deleteProject = useCallback((id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id))
    setDocuments((prev) => prev.filter((d) => d.projectId !== id))
  }, [])

  const addDocument = useCallback(
    (docData: Omit<Document, 'id' | 'createdAt' | 'updatedAt' | 'version'>) => {
      const newDocument: Document = {
        ...docData,
        id: `doc-${Date.now()}`,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setDocuments((prev) => [...prev, newDocument])
      setProjects((prev) =>
        prev.map((p) =>
          p.id === docData.projectId
            ? { ...p, documentsCount: p.documentsCount + 1, updatedAt: new Date().toISOString() }
            : p
        )
      )
    },
    []
  )

  const updateDocument = useCallback((id: string, updates: Partial<Document>) => {
    setDocuments((prev) =>
      prev.map((d) =>
        d.id === id
          ? { ...d, ...updates, updatedAt: new Date().toISOString(), version: d.version + 1 }
          : d
      )
    )
  }, [])

  const deleteDocument = useCallback((id: string) => {
    const doc = documents.find((d) => d.id === id)
    if (doc) {
      setDocuments((prev) => prev.filter((d) => d.id !== id))
      setProjects((prev) =>
        prev.map((p) =>
          p.id === doc.projectId
            ? { ...p, documentsCount: Math.max(0, p.documentsCount - 1) }
            : p
        )
      )
    }
  }, [documents])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  return (
    <AppContext.Provider
      value={{
        user,
        company,
        projects,
        documents,
        notifications,
        isAuthenticated,
        login,
        logout,
        addProject,
        updateProject,
        deleteProject,
        addDocument,
        updateDocument,
        deleteDocument,
        markNotificationRead,
        markAllNotificationsRead,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const context = useContext(AppContext)
  if (!context) {
    throw new Error('useApp must be used within an AppProvider')
  }
  return context
}
