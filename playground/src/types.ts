export interface Bookmark {
  id: string;
  url: string;
  title: string;
  tags: string[];
  created_at: string;
}

export interface CreateBookmarkInput {
  url: string;
  tags?: string;
}
