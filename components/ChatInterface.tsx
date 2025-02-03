import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { LoadingDots } from '@/components/ui/loading-dots';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  thinking?: string;
}

const markdownComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
  code: ({ children }) => (
    <code className="bg-gray-200 dark:bg-gray-700 rounded px-1 py-0.5">{children}</code>
  ),
};

const thinkingComponents: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc ml-4 mb-2">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal ml-4 mb-2">{children}</ol>,
  li: ({ children }) => <li className="mb-1">{children}</li>,
};

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    // Add user message to chat
    setMessages((prev) => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMessage }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to get response');
      }

      // Add assistant's response to chat
      setMessages((prev) => [
        ...prev,
        { 
          role: 'assistant', 
          content: data.message,
          thinking: data.thinking 
        },
      ]);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to get response',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message, index) => (
          <div key={index} className="space-y-4">
            <div
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[80%] rounded-lg p-4 ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
                }`}
              >
                <ReactMarkdown
                  className="prose dark:prose-invert max-w-none"
                  components={markdownComponents}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            </div>
            
            {message.thinking && (
              <div className="flex justify-start">
                <div className="max-w-[80%] rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
                  <div className="font-medium text-sm mb-2 text-yellow-800 dark:text-yellow-200">
                    Reasoning Process:
                  </div>
                  <ReactMarkdown
                    className="prose dark:prose-invert max-w-none text-sm text-yellow-700 dark:text-yellow-300"
                    components={thinkingComponents}
                  >
                    {message.thinking}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}
        
        {isLoading && (
          <div className="space-y-4">
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-lg p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700">
                <div className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                  <span className="font-medium text-sm">Processing request</span>
                  <LoadingDots />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t dark:border-gray-700">
        <div className="flex gap-2">
          <Textarea
            placeholder="Ask a question..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
          <Button type="submit" disabled={isLoading} className="min-w-[80px]">
            {isLoading ? (
              <LoadingDots className="text-white" />
            ) : (
              'Send'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
} 