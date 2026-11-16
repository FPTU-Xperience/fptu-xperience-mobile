// hooks/useInfiniteList.ts
import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export type Cursor = string | number | null;

export interface InfinitePage<T, M = undefined> {
  items: T[];
  /** null = đã hết dữ liệu */
  nextCursor: Cursor;
  /** Dữ liệu đi kèm trang đầu (tổng số, bộ lọc, campus...) */
  meta?: M;
}

type Options<T> = {
  /** Dùng để loại bỏ mục trùng khi nối trang */
  keyOf?: (item: T) => string | number;
  /** Chuyển lỗi thành thông báo hiển thị (vd: getApiErrorMessage). Mặc định lấy error.message. */
  getErrorMessage?: (error: unknown) => string;
};

const DEFAULT_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại.';

const defaultToMessage = (e: unknown) =>
  e instanceof Error && e.message ? e.message : DEFAULT_ERROR;

/**
 * Danh sách cuộn vô hạn.
 * - Đổi `deps` (từ khóa, bộ lọc...) sẽ tải lại từ trang đầu.
 * - Bỏ qua kết quả của các request đã cũ (tránh lẫn dữ liệu khi đổi bộ lọc nhanh).
 */
export function useInfiniteList<T, M = undefined>(
  fetchPage: (cursor: Cursor) => Promise<InfinitePage<T, M>>,
  deps: DependencyList,
  options: Options<T> = {},
) {
  const [items, setItems] = useState<T[]>([]);
  const [meta, setMeta] = useState<M | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<Cursor>(null);
  const [hasMore, setHasMore] = useState(false);

  const [loading, setLoading] = useState(true); // đang tải trang đầu
  const [refreshing, setRefreshing] = useState(false); // kéo để làm mới
  const [loadingMore, setLoadingMore] = useState(false);

  const [error, setError] = useState<string | null>(null); // lỗi tải trang đầu
  const [moreError, setMoreError] = useState<string | null>(null); // lỗi tải thêm

  const requestId = useRef(0);
  const loadingMoreRef = useRef(false);

  // Luôn dùng bản mới nhất của hàm fetch và options mà không làm đổi callback
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  const keyOfRef = useRef(options.keyOf);
  keyOfRef.current = options.keyOf;
  const toMessageRef = useRef(options.getErrorMessage ?? defaultToMessage);
  toMessageRef.current = options.getErrorMessage ?? defaultToMessage;

  const loadFirst = useCallback(async (isRefresh = false) => {
    const id = ++requestId.current;
    loadingMoreRef.current = false;
    setLoadingMore(false);
    setError(null);
    setMoreError(null);
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const page = await fetchRef.current(null);
      if (id !== requestId.current) return;
      setItems(page.items);
      setMeta(page.meta);
      setNextCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch (e) {
      if (id !== requestId.current) return;
      setItems([]);
      setHasMore(false);
      setError(toMessageRef.current(e));
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Tải lại từ đầu mỗi khi deps (từ khóa, bộ lọc...) đổi
  useEffect(() => {
    loadFirst();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || loading || refreshing || error || moreError) return;

    const id = requestId.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const page = await fetchRef.current(nextCursor);
      if (id !== requestId.current) return;

      const keyOf = keyOfRef.current;
      setItems((prev) => {
        if (!keyOf) return [...prev, ...page.items];
        const seen = new Set(prev.map(keyOf));
        return [...prev, ...page.items.filter((i) => !seen.has(keyOf(i)))];
      });
      setNextCursor(page.nextCursor);
      setHasMore(page.nextCursor !== null);
    } catch (e) {
      if (id === requestId.current) setMoreError(toMessageRef.current(e));
    } finally {
      if (id === requestId.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [hasMore, loading, refreshing, error, moreError, nextCursor]);

  const refresh = useCallback(() => loadFirst(true), [loadFirst]);
  const retry = useCallback(() => loadFirst(false), [loadFirst]);

  /** Thử lại khi tải thêm bị lỗi */
  const retryMore = useCallback(() => {
    setMoreError(null);
  }, []);

  return {
    items,
    meta,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    moreError,
    loadMore,
    refresh,
    retry,
    retryMore,
  };
}