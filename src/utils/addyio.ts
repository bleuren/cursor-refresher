import axios from 'axios';
import { ExtensionConfig } from './config';

interface AddyAlias {
  id: string;
  email: string;
  description?: string;
  [key: string]: unknown;
}

export class EmailAliasManager {
  constructor(private readonly config: ExtensionConfig) { }

  async refresh(): Promise<string> {
    if (!this.config.addyConfig.apiKey) {
      throw new Error('Addy.io API key is required');
    }

    await this.deleteExistingAliases();
    return this.createNewAlias();
  }

  private get headers() {
    return {
      Authorization: `Bearer ${this.config.addyConfig.apiKey}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    };
  }

  private async deleteExistingAliases(): Promise<void> {
    const { apiUrl, description } = this.config.addyConfig;
    const response = await axios.get<{ data: AddyAlias[] }>(apiUrl, {
      headers: this.headers,
      params: {
        'filter[search]': description,
        'page[size]': 100
      }
    });

    const aliases = response.data.data.filter(alias =>
      alias.description?.startsWith(description)
    );

    await Promise.all(
      aliases.map(alias =>
        axios.delete(`${apiUrl}/${alias.id}`, { headers: this.headers })
      )
    );
  }

  private async createNewAlias(): Promise<string> {
    const { apiUrl, domain, description, format, recipientIds } = this.config.addyConfig;
    const payload = {
      domain,
      description,
      format,
      ...(recipientIds.length && { recipient_ids: recipientIds })
    };

    const response = await axios.post(apiUrl, payload, { headers: this.headers });
    return response.data.data.email || '';
  }
}