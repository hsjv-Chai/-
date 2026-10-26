export type User = {
  id: string;
  username: string;
  nickname: string;
  role: string;
  created_at?: number;
};

export type Category = {
  id: string;
  name: string;
  description: string;
  count: number;
};

export type Post = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  category_id: string;
  category_name: string;
  nickname: string;
  username: string;
  created_at: number;
  updated_at: number;
  like_count: number;
  reply_count: number;
  liked: number;
  featured: number;
  pinned: number;
  hidden: number;
  demo: number;
  cover: string | null;
  heat: number;
};

export type Reply = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  nickname: string;
  created_at: number;
  quote_body: string | null;
  quote_nickname: string | null;
  hidden: number;
  title?: string;
};

export type Detail = { post: Post; replies: Reply[]; images: { id: string }[] };
