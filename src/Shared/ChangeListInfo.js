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
  constructor(changelistNumber, description, files, submitState = SubmitStates.PENDING, date = '', codeReviewState = CodeReviewStates.NEEDS_REVIEW) {
    this.changelistNumber = changelistNumber;
    this.description = description;
    this.files = files;
    this.submitState = submitState;
    this.date = date;
    this.codeReviewState = codeReviewState;
  }

}