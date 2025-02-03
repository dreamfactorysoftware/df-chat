"use client"

import { useState } from "react"
import { ApiKeyForm } from "@/components/ApiKeyForm"
import { ChatInterface } from "@/components/ChatInterface"

export default function Home() {
  const [hasApiKey, setHasApiKey] = useState(false)

  return (
    <main className="flex min-h-screen flex-col p-4 md:p-24">
      <div className="max-w-2xl mx-auto w-full">
        <h1 className="text-3xl font-bold mb-8 text-center">
          DreamFactory AI Chat
        </h1>
        
        {!hasApiKey ? (
          <ApiKeyForm onSuccess={() => setHasApiKey(true)} />
        ) : (
          <ChatInterface />
        )}
      </div>
    </main>
  )
}

