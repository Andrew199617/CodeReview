export const CodeReviewStates = {
  NEEDS_REVIEW: 'needs_review',
  APPROVED: 'approved',
  ARCHIVED: 'archived',
  REJECTED: 'rejected',
  NEEDS_REVISION: 'needs_revision'
}

export const SubmitStates = {
  PENDING: 'pending',
  SUBMITTED: 'submitted'
}

/**
 * Represents the information related to a change list.
 */
export class ChangeListInfo {
  /**
   * @param {number} changelistNumber The changelist number.
   * @param {string} description The description of the changelist.
   * @param {Array<string>} files The list of files in the changelist.
   * @param {string} submitState The submit state of the changelist.
   * @param {string} date The date of the changelist.
   * @param {string} codeReviewState The code review state of the changelist.
   * @param {number|undefined} swarmReviewId The associated Swarm review ID, if any.
   **/
  constructor(
    changelistNumber,
    description,
    files,
    submitState = SubmitStates.PENDING,
    date = '',
    codeReviewState = CodeReviewStates.NEEDS_REVIEW,
    swarmReviewId = undefined
  ) {
    this.changelistNumber = changelistNumber;
    this.description = description;
    this.files = files;
    this.submitState = submitState;
    this.date = date;
    this.codeReviewState = codeReviewState;
    this.swarmReviewId = swarmReviewId;
    this.loading = true;
  }
}