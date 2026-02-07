import * as vscode from 'vscode';

/**
* @description Provides settings for the Perforce extension.
*/
export class ConfigService {
  constructor() { }

  /**
   * Get the raw options object from workspace configuration.
   * @returns {Object} A shallow copy of the review options object or empty object.
   */
  getOptions() {
    const config = vscode.workspace.getConfiguration();
    const reviewUsers = config.get('lgd.options.reviewUsers') || config.get('perforce.reviewUsers');
    const optionsConfig = { reviewUsers };
    return optionsConfig && typeof optionsConfig === 'object' ? optionsConfig : {};
  }

  /**
   * Get the list of review users from configuration or environment variables.
   * @returns {string[]} An array of trimmed review user strings.
   */
  getReviewUsers() {
    const optionsObj = this.getOptions();
    if (optionsObj && Array.isArray(optionsObj.reviewUsers)) {
      return optionsObj.reviewUsers
        .filter((user) => !!user)
        .map((user) => String(user).trim())
        .filter((user) => user.length > 0);
    }

    const envUsers = (process.env.REVIEW_USERS || process.env.P4_REVIEW_USERS || '').split(',');
    const users = envUsers.map((s) => String(s || '').trim()).filter((s) => s);
    return users;
  }

  /**
   * Get the OpenAI API key from configuration.
   * @returns {string | undefined} The OpenAI API key if set.
   */
  getOpenAIKey() {
    const config = vscode.workspace.getConfiguration();
    const nested = config.get('lgd.options.openAI.apiKey') || config.get('perforce.openAI.apiKey');
    if (nested) return nested;
    const openAI = config.get('lgd.options.openAI') || config.get('perforce.openAI');
    if (openAI && typeof openAI === 'string') return openAI;
    if (openAI && typeof openAI === 'object' && openAI.apiKey) return openAI.apiKey;
    return undefined;
  }

  /**
   * Set the OpenAI API key in configuration.
   * @param {string} apiKey - The OpenAI API key to set.
   * @returns {Promise<boolean>} Resolves to true when the key is successfully set.
   */
  async setOpenAIKey(apiKey) {
    try {
      const config = vscode.workspace.getConfiguration();
      await config.update('lgd.options.openAI.apiKey', apiKey, vscode.ConfigurationTarget.Global);

      const existing = config.get('lgd.options.openAI');
      if (!existing || typeof existing !== 'object') {
        await config.update('lgd.options.openAI', { apiKey }, vscode.ConfigurationTarget.Global);
      }

      vscode.window.showInformationMessage('OpenAI API Key saved to settings.');
      return true;
    }
    catch (error) {
      vscode.window.showErrorMessage(`Failed to save OpenAI API Key: ${error && error.message ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Get the OpenAI model from configuration.
   * @returns {string | undefined} The OpenAI model if set.
   */
  getOpenAIModel() {
    const config = vscode.workspace.getConfiguration();
    const nested = config.get('lgd.options.openAI.model') || config.get('perforce.openAI.model');
    if (nested) return nested;
    const openAI = config.get('lgd.options.openAI') || config.get('perforce.openAI');
    if (openAI && typeof openAI === 'object' && openAI.model) return openAI.model;
    return undefined;
  }

  getPerforceConnection() {
    return {
      port: this.getPerforcePort(),
      user: this.getPerforceUser(),
      client: this.getPerforceClient()
    }
  }

  /** @returns {string|undefined} Perforce client/workspace (P4CLIENT) */
  getPerforceClient() {
    const config = vscode.workspace.getConfiguration();
    const client = config.get('lgd.options.perforceClient') || config.get('perforce.client');
    return (typeof client === 'string' && client.trim()) ? client.trim() : undefined;
  }

  /** @returns {string|undefined} Perforce user (P4USER) */
  getPerforceUser() {
    const config = vscode.workspace.getConfiguration();
    const user = config.get('lgd.options.perforceUser') || config.get('perforce.user');
    return (typeof user === 'string' && user.trim()) ? user.trim() : undefined;
  }

  /** @returns {string|undefined} Perforce server:port (P4PORT) */
  getPerforcePort() {
    const config = vscode.workspace.getConfiguration();
    const port = config.get('lgd.options.perforcePort') || config.get('perforce.port');
    return (typeof port === 'string' && port.trim()) ? port.trim() : undefined;
  }

  /** Persist Perforce client */
  async setPerforceClient(client) {
    const config = vscode.workspace.getConfiguration();
    await config.update('lgd.options.perforceClient', client, vscode.ConfigurationTarget.Workspace);
  }

  /** Persist Perforce user */
  async setPerforceUser(user) {
    const config = vscode.workspace.getConfiguration();
    await config.update('lgd.options.perforceUser', user, vscode.ConfigurationTarget.Workspace);
  }

  /** Persist Perforce port */
  async setPerforcePort(port) {
    const config = vscode.workspace.getConfiguration();
    await config.update('lgd.options.perforcePort', port, vscode.ConfigurationTarget.Workspace);
  }

  /**
   * Set the OpenAI model in configuration.
   * @param {string} model - The OpenAI model to set.
   * @returns {Promise<boolean>} Resolves to true when the model is successfully set.
   */
  async setOpenAIModel(model) {
    try {
      const config = vscode.workspace.getConfiguration();
      await config.update('lgd.options.openAI.model', model, vscode.ConfigurationTarget.Global);

      const existing = config.get('lgd.options.openAI');
      if (!existing || typeof existing !== 'object') {
        await config.update('lgd.options.openAI', { model }, vscode.ConfigurationTarget.Global);
      }

      vscode.window.showInformationMessage('OpenAI model saved to settings.');
      return true;
    }
    catch (error) {
      vscode.window.showErrorMessage(`Failed to save OpenAI model: ${error && error.message ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Prompt the user for the OpenAI API key and model if not set.
   * @returns {Promise<boolean>} Resolves to true if both values are set, false otherwise.
   */
  async ensureOpenAIConfig() {
    let apiKey = this.getOpenAIKey();
    if (!apiKey) {
      apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your OpenAI API Key',
        ignoreFocusOut: true,
        password: true
      });

      if (apiKey) {
        const ok = await this.setOpenAIKey(apiKey);
        if (!ok) return false;
      }
      else {
        vscode.window.showErrorMessage('OpenAI API Key is required for AI commands.');
        return false;
      }
    }

    let model = this.getOpenAIModel();
    if (!model) {
      model = await vscode.window.showInputBox({
        prompt: 'Enter the OpenAI Model to use (e.g., gpt-4)',
        ignoreFocusOut: true
      });

      if (model) {
        const ok = await this.setOpenAIModel(model);
        if (!ok) return false;
      }
      else {
        vscode.window.showErrorMessage('OpenAI Model is required for AI commands.');
        return false;
      }
    }

    return true;
  }
}
