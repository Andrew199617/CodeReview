import OpenAI from 'openai';

function chunkString(strText, nMax) {
  if (strText.length <= nMax) {
    return [strText];
  }

  const arrChunks = [];
  for (let i = 0; i < strText.length; i += nMax) {
    arrChunks.push(strText.slice(i, i + nMax));
  }

  return arrChunks;
}

function buildPrompt(strInstructions, strDepotFile, strDiff) {
  const strGuidance = strInstructions && strInstructions.trim() ? strInstructions.trim() : 'Review this code change for correctness, style, performance, security, and testability.';

  return `You are an expert senior engineer performing a code review. Be specific and actionable.

Custom review focus:
${strGuidance}

Target file: ${strDepotFile}
Provide:
- Summary (2-4 bullets)
- Key risks and defects with code excerpts
- Improvement suggestions
- Severity labels: [blocker|major|minor|nit]

Unified diff:
\n${strDiff}\n`;
}

export class AIReviewer {
  constructor(strApiKey, strBaseUrl, strModel) {
    this.client = new OpenAI({ apiKey: strApiKey, baseURL: strBaseUrl || undefined });
    this.strModel = strModel;
  }

  /**
   * Review code using OpenAI API.
   * @param {string} strPrompt - The prompt to send to the AI for review.
   * @returns {Promise<string>} The review text.
   */
  async reviewWithOpenAI(strPrompt) {
    const resp = await this.client.chat.completions.create({
      model: this.strModel,
      messages: [
        { role: 'system', content: 'You are a concise, rigorous code reviewer. Prefer clear bullet lists and short, actionable notes.' },
        { role: 'user', content: strPrompt }
      ]
    });

    return resp.choices?.[0]?.message?.content ?? '';
  }

  /**
  * @description Review a code diff for a specific file.
  */
  async reviewDiffForFile(strInstructions, strDepotFile, strDiff) {
    const arrChunks = chunkString(strDiff, 12000);
    const arrPartials = [];

    for (let i = 0; i < arrChunks.length; i++) {
      const strPartPrompt = buildPrompt(strInstructions, strDepotFile, `Part ${i + 1}/${arrChunks.length}\n\n${arrChunks[i]}`);
      const strPart = await this.reviewWithOpenAI(strPartPrompt);
      arrPartials.push(strPart);
    }

    if (arrPartials.length === 1) {
      return arrPartials[0];
    }

    const strMergePrompt = `Combine these per-chunk reviews into a single, non-redundant review. Keep structure and priorities clear.\n\n${arrPartials.map((p, i) => `Chunk ${i + 1}:\n${p}`).join('\n\n')}`;
    return await this.reviewWithOpenAI(strMergePrompt);
  }

  async summarizeAcrossFiles(arrResults, nCl) {
    const strJoined = arrResults.map(r => `File: ${r.strDepotFile}\n---\n${r.strContent}\n`).join('\n\n');
    const strPrompt = `Create a concise overall code review summary across files. Identify common issues, cross-file risks, and prioritize follow-ups.\n\n${strJoined}`;
    const strSummary = await this.reviewWithOpenAI(strPrompt);
    return `# Changelist ${nCl} - Summary\n\n${strSummary}\n`;
  }
}
