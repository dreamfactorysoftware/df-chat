interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

interface SearchResponse {
  searchParameters: {
    q: string;
    gl: string;
    hl: string;
  };
  organic: SearchResult[];
  knowledgeGraph?: {
    title: string;
    type: string;
    description?: string;
    attributes?: Record<string, string>;
  };
}

export class SearchService {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('Serper API key is required');
    }
    this.apiKey = apiKey;
  }

  async search(query: string): Promise<SearchResponse> {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        q: query,
        gl: 'us',  // Geolocation: United States
        hl: 'en',  // Language: English
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch search results');
    }

    return response.json();
  }

  // Helper method to extract the most relevant information
  static summarizeResults(results: SearchResponse): string {
    let summary = '';

    // If there's a knowledge graph result, use it first
    if (results.knowledgeGraph) {
      summary += `${results.knowledgeGraph.title}: ${results.knowledgeGraph.description || ''}\n\n`;
      
      if (results.knowledgeGraph.attributes) {
        for (const [key, value] of Object.entries(results.knowledgeGraph.attributes)) {
          summary += `${key}: ${value}\n`;
        }
        summary += '\n';
      }
    }

    // Add top organic results
    if (results.organic && results.organic.length > 0) {
      const topResults = results.organic.slice(0, 3);
      summary += 'Top Results:\n';
      topResults.forEach((result) => {
        summary += `- ${result.snippet}\n`;
      });
    }

    return summary.trim();
  }
} 