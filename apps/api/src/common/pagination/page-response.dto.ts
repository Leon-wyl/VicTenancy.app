export class PageInfo {
  nextCursor: string | null;
}

export class PageResponse<T> {
  data: T[];
  page: PageInfo;

  constructor(data: T[], nextCursor: string | null) {
    this.data = data;
    this.page = { nextCursor };
  }
}
