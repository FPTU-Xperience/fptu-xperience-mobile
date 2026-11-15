// components/profile/EvidenceTab.tsx
//
// Tab "Minh chứng" (Phase 5) — danh sách contribution thật từ
// `GET /api/users/me/contributions` (fetchContributions):
//   - load-more theo `totalPages` (phân trang phía server, PAGE_SIZE = 20)
//   - chip trạng thái xét duyệt (Đã ghi nhận / Chờ xét duyệt / ...)
//   - điểm XP chỉ hiện khi APPROVED (backend: rawPoints chỉ có nghĩa khi
//     contribution được ghi nhận)
//
// Nạp riêng (không đi qua feed `fetchProfile`): danh sách có thể dài + phân
// trang ⇒ nạp độc lập để tab khác không phải chờ. Lỗi nguồn này không làm
// hỏng màn profile (quy tắc Phase 1 — một nguồn lỗi không kéo đổ cả feed).
//
// Pattern state: tự quản pagination bằng local state (không dùng useApiState vì
// nó không hỗ trợ append page). Initial load có cancellation guard
// (mirror useEffect fetch ở scan.tsx).

import { Award, ChevronDown, FileCheck2, Star } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import Card from '@/components/common/Card';
import CardTitle from '@/components/common/CardTitle';
import ErrorState from '@/components/common/ErrorState';
import { getApiErrorMessage } from '@/services/apiClient';
import { fetchContributions, CONTRIBUTION_STATUS_LABEL } from '@/services/profile';
import type { Evidence } from '@/types/profile';

/** pageSize khớp default backend (20). */
const PAGE_SIZE = 20;

/**
 * Màu chip theo trạng thái:
 *  - APPROVED            → xanh lá (đã ghi nhận điểm)
 *  - SUBMITTED / REVISION_REQUESTED → vàng (đang chờ / cần bổ sung)
 *  - REJECTED            → đỏ nhạt (không thông qua)
 *  - REVOKED / unknown   → xám
 */
function statusChipStyle(status: string | undefined): { bg: string; fg: string } {
  switch ((status ?? '').toUpperCase()) {
    case 'APPROVED':
      return { bg: '#DCFCE7', fg: '#15803D' };
    case 'SUBMITTED':
    case 'REVISION_REQUESTED':
      return { bg: '#FEF3C7', fg: '#B45309' };
    case 'REJECTED':
      return { bg: '#FEE2E2', fg: '#B91C1C' };
    default:
      return { bg: '#F3F4F6', fg: '#6B7280' };
  }
}

export default function EvidenceTab() {
  const [items, setItems] = useState<Evidence[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Initial load (+ retry) — setState chỉ chạy trong .then/.catch (async),
  // reset state chuyển sang handler `retry` (không gọi setState đồng bộ
  // trong effect body — rule react-hooks/set-state-in-effect).
  useEffect(() => {
    let cancelled = false;

    fetchContributions({ page: 1, pageSize: PAGE_SIZE })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setPage(1);
        setTotalPages(res.totalPages);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err));
        setHasError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Retry: reset toàn bộ state trong handler event (không phải effect).
  const retry = useCallback(() => {
    setItems([]);
    setPage(1);
    setTotalPages(1);
    setError(null);
    setHasError(false);
    setMoreError(null);
    setLoading(true); // hiện spinner trong lúc fetch lại (không thì flash empty)
    setReloadKey((k) => k + 1);
  }, []);

  // Load-more: nối page tiếp vào danh sách (khử trùng theo id phòng backend
  // trả lại item cũ khi dữ liệu thay đổi giữa 2 request).
  const loadMore = useCallback(async () => {
    if (loadingMore || page >= totalPages) return;
    const target = page + 1;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const res = await fetchContributions({ page: target, pageSize: PAGE_SIZE });
      setItems((prev) => {
        const seen = new Set(prev.map((e) => e.id));
        return [...prev, ...res.items.filter((e) => !seen.has(e.id))];
      });
      setPage(target);
      setTotalPages(res.totalPages);
    } catch (err: unknown) {
      setMoreError(getApiErrorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, page, totalPages]);

  const hasMore = page < totalPages;

  return (
    <Card>
      <CardTitle
        icon={FileCheck2}
        title="Minh chứng hoạt động"
        right={
          items.length > 0 ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>{items.length} hồ sơ</Text>
            </View>
          ) : undefined
        }
      />

      {hasError && error ? (
        <ErrorState message={error} onRetry={retry} loading={loading} />
      ) : loading ? (
        <ActivityIndicator color="#F97316" style={styles.loader} />
      ) : items.length === 0 ? (
        <EmptyEvidence />
      ) : (
        <>
          <View style={styles.list}>
            {items.map((e) => (
              <EvidenceRow key={e.id} evidence={e} />
            ))}
          </View>

          {moreError ? (
            <View style={styles.loadMoreWrap}>
              <Text style={styles.loadMoreError}>{moreError}</Text>
              <Pressable style={styles.retry} onPress={loadMore}>
                <Text style={styles.retryText}>Thử lại</Text>
              </Pressable>
            </View>
          ) : hasMore ? (
            <Pressable
              style={({ pressed }) => [styles.loadMore, pressed && { opacity: 0.7 }]}
              onPress={loadMore}
              disabled={loadingMore}
              hitSlop={6}>
              {loadingMore ? (
                <ActivityIndicator size="small" color="#F97316" />
              ) : (
                <View style={styles.loadMoreRow}>
                  <ChevronDown size={16} color="#F97316" />
                  <Text style={styles.loadMoreText}>Xem thêm</Text>
                </View>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------

function EvidenceRow({ evidence }: { evidence: Evidence }) {
  const status = evidence.status?.toUpperCase();
  const hasStatus = status !== undefined && status.length > 0;
  const chip = hasStatus ? statusChipStyle(evidence.status) : null;
  const chipLabel = hasStatus
    ? CONTRIBUTION_STATUS_LABEL[evidence.status ?? ''] ?? evidence.status
    : '';
  const showPoints = status === 'APPROVED' && evidence.rawPoints != null;

  return (
    <View style={styles.item}>
      <View style={styles.itemIcon}>
        {showPoints ? (
          <Star size={16} color="#C2410C" />
        ) : (
          <Award size={16} color="#9CA3AF" />
        )}
      </View>

      <View style={styles.itemBody}>
        <Text style={styles.itemTitle} numberOfLines={1}>
          {evidence.title}
        </Text>
        <View style={styles.itemSubRow}>
          <Text style={styles.itemSub} numberOfLines={1}>
            {evidence.issuer}
            {evidence.date ? ` · ${evidence.date}` : ''}
          </Text>
        </View>
        {chip ? (
          <View style={[styles.chip, { backgroundColor: chip.bg }]}>
            <Text style={[styles.chipText, { color: chip.fg }]}>{chipLabel}</Text>
          </View>
        ) : null}
      </View>

      {showPoints ? (
        <View style={styles.points}>
          <Text style={styles.pointsValue}>{Math.round(evidence.rawPoints ?? 0)}</Text>
          <Text style={styles.pointsUnit}>XP</Text>
        </View>
      ) : null}
    </View>
  );
}

function EmptyEvidence() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Award size={22} color="#9CA3AF" />
      </View>
      <Text style={styles.emptyTitle}>Chưa có minh chứng nào</Text>
      <Text style={styles.emptyDesc}>
        Tham gia hoạt động và điểm danh bằng mã QR để nhận minh chứng đầu tiên.
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  loader: { marginTop: 40 },
  empty: { alignItems: 'center', paddingVertical: 24 },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EEF0F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#111827', marginTop: 12 },
  emptyDesc: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  countPill: {
    backgroundColor: '#FFF1E6',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  countPillText: { fontSize: 11, fontWeight: '700', color: '#C2410C' },

  list: { marginTop: 12, gap: 10 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#F3F4F8',
  },
  itemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { fontSize: 13, fontWeight: '800', color: '#111827' },
  itemSubRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  itemSub: { fontSize: 11, color: '#6B7280' },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  chipText: { fontSize: 10, fontWeight: '700' },
  points: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  pointsValue: { fontSize: 15, fontWeight: '800', color: '#C2410C' },
  pointsUnit: { fontSize: 9, fontWeight: '700', color: '#9CA3AF', marginTop: -2 },

  loadMore: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    alignItems: 'center',
  },
  loadMoreRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loadMoreText: { fontSize: 12.5, fontWeight: '700', color: '#C2410C' },
  loadMoreWrap: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
  },
  loadMoreError: { fontSize: 11.5, color: '#B91C1C', marginBottom: 6 },
  retry: { paddingVertical: 4, paddingHorizontal: 10 },
  retryText: { fontSize: 12, fontWeight: '700', color: '#B91C1C' },
});
