import * as vscode from 'vscode';

/**
* @description Provides settings for the Perforce extension.
*/
export class ConfigService
{
  constructor() { }

  /**
   * Get the raw options object from workspace configuration.
   * @returns {Object} A shallow copy of the review options object or empty object.
   */
  getOptions()
  {
    const config = vscode.workspace.getConfiguration('perforce');
    const optionsConfig = { reviewUsers: config.get('reviewUsers') };
    return optionsConfig && typeof optionsConfig === 'object' ? optionsConfig : {};
  }

  /**
   * Get the list of review users from configuration or environment variables.
   * @returns {string[]} An array of trimmed review user strings.
   */
  getReviewUsers()
  {
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
}
