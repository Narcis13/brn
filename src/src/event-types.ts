export const EventTypes = {
  // Board events
  BOARD_CREATED: 'board.created',
  BOARD_DELETED: 'board.deleted',
  BOARD_MEMBER_INVITED: 'board.member_invited',
  BOARD_MEMBER_REMOVED: 'board.member_removed',

  // Column events
  COLUMN_CREATED: 'column.created',
  COLUMN_UPDATED: 'column.updated',
  COLUMN_DELETED: 'column.deleted',
  COLUMN_REORDERED: 'column.reordered',

  // Card events
  CARD_CREATED: 'card.created',
  CARD_UPDATED: 'card.updated',
  CARD_MOVED: 'card.moved',
  CARD_DELETED: 'card.deleted',
  CARD_DATES_CHANGED: 'card.dates_changed',
  CARD_WATCHED: 'card.watched',
  CARD_UNWATCHED: 'card.unwatched',

  // Label events
  LABEL_CREATED: 'label.created',
  LABEL_UPDATED: 'label.updated',
  LABEL_DELETED: 'label.deleted',
  CARD_LABEL_ASSIGNED: 'card.label_assigned',
  CARD_LABEL_REMOVED: 'card.label_removed',

  // Comment events
  COMMENT_CREATED: 'comment.created',
  COMMENT_UPDATED: 'comment.updated',
  COMMENT_DELETED: 'comment.deleted',

  // Reaction events
  REACTION_TOGGLED: 'reaction.toggled',

  // Artifact events
  ARTIFACT_CREATED: 'artifact.created',
  ARTIFACT_UPDATED: 'artifact.updated',
  ARTIFACT_DELETED: 'artifact.deleted',
  ARTIFACT_EXECUTED: 'artifact.executed',

  // Checklist events
  CHECKLIST_ITEM_ADDED: 'checklist.item_added',
  CHECKLIST_ITEM_CHECKED: 'checklist.item_checked',
  CHECKLIST_ITEM_UNCHECKED: 'checklist.item_unchecked',
  CHECKLIST_ITEM_REMOVED: 'checklist.item_removed',
} as const

export type EventType = typeof EventTypes[keyof typeof EventTypes]

// Event payload types for each event
export interface BoardCreatedPayload {
  boardId: string
  name: string
}

export interface BoardDeletedPayload {
  boardId: string
  name: string
}

export interface BoardMemberInvitedPayload {
  boardId: string
  invitedUserId: string
  invitedUserEmail: string
}

export interface BoardMemberRemovedPayload {
  boardId: string
  removedUserId: string
  removedUserEmail: string
}

export interface ColumnCreatedPayload {
  boardId: string
  columnId: string
  name: string
  position: number
}

export interface ColumnUpdatedPayload {
  boardId: string
  columnId: string
  name: string
  oldName: string
}

export interface ColumnDeletedPayload {
  boardId: string
  columnId: string
  name: string
}

export interface ColumnReorderedPayload {
  boardId: string
  columns: Array<{ id: string; name: string; position: number }>
}

export interface CardCreatedPayload {
  cardId: string
  boardId: string
  columnId: string
  title: string
  position: number
}

export interface CardUpdatedPayload {
  cardId: string
  boardId: string
  columnId: string
  title?: string
  description?: string
  changes: string[]
}

export interface CardMovedPayload {
  cardId: string
  cardTitle: string
  boardId: string
  fromColumn: string
  toColumn: string
  fromPosition: number
  toPosition: number
}

export interface CardDeletedPayload {
  cardId: string
  boardId: string
  columnId: string
  title: string
}

export interface CardDatesChangedPayload {
  cardId: string
  boardId: string
  startDate?: string | null
  dueDate?: string | null
  oldStartDate?: string | null
  oldDueDate?: string | null
}

export interface CardWatchedPayload {
  cardId: string
  boardId: string
  watcherId: string
}

export interface CardUnwatchedPayload {
  cardId: string
  boardId: string
  unwatcherId: string
}

export interface LabelCreatedPayload {
  boardId: string
  labelId: string
  name: string
  color: string
}

export interface LabelUpdatedPayload {
  boardId: string
  labelId: string
  name?: string
  color?: string
  oldName?: string
  oldColor?: string
}

export interface LabelDeletedPayload {
  boardId: string
  labelId: string
  name: string
}

export interface CardLabelAssignedPayload {
  cardId: string
  boardId: string
  labelId: string
  labelName: string
}

export interface CardLabelRemovedPayload {
  cardId: string
  boardId: string
  labelId: string
  labelName: string
}

export interface CommentCreatedPayload {
  boardId: string
  cardId: string
  commentId: string
  content: string
}

export interface CommentUpdatedPayload {
  boardId: string
  cardId: string
  commentId: string
  content: string
  oldContent: string
}

export interface CommentDeletedPayload {
  boardId: string
  cardId: string
  commentId: string
}

export interface ReactionToggledPayload {
  boardId: string
  commentId: string
  emoji: string
  added: boolean
}

export interface ArtifactCreatedPayload {
  boardId: string
  artifactId: string
  cardId: string | null
  name: string
  type: string
}

export interface ArtifactUpdatedPayload {
  boardId: string
  artifactId: string
  cardId: string | null
  name: string
  content?: string
}

export interface ArtifactDeletedPayload {
  boardId: string
  artifactId: string
  cardId: string | null
  name: string
}

export interface ArtifactExecutedPayload {
  boardId: string
  artifactId: string
  cardId: string | null
  exitCode: number
  duration: number
}

export interface ChecklistItemAddedPayload {
  boardId: string
  cardId: string
  itemIndex: number
  text: string
}

export interface ChecklistItemCheckedPayload {
  boardId: string
  cardId: string
  itemIndex: number
  text: string
}

export interface ChecklistItemUncheckedPayload {
  boardId: string
  cardId: string
  itemIndex: number
  text: string
}

export interface ChecklistItemRemovedPayload {
  boardId: string
  cardId: string
  itemIndex: number
  text: string
}