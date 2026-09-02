import { Role } from "../../common/enums/role.enum";
import { ICoverImage } from "../../database/models/blog/blog.interface";

export interface ICreateBlogInput {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  tags?: string[] | string;
  status?: "draft" | "published";
  coverImage?: ICoverImage;
}

export interface IUpdateBlogInput {
  title?: string;
  excerpt?: string;
  content?: string;
  category?: string;
  tags?: string[] | string;
  status?: "draft" | "published";
  coverImage?: ICoverImage;
}

export interface IBlogFilterQuery {
  page?: string | number;
  limit?: string | number;
  search?: string;
  category?: string;
  tag?: string;
  status?: "draft" | "published";
  authorId?: string;
  role?: Role;
  sort?: "latest" | "views" | "trending";
}

export interface IPaginatedBlogsResult<T> {
  blogs: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}
