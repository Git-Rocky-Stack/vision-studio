// Importing the host registers its lazy mounter, so any caller of
// pushNotice through this entry gets a visible notice without a layout edit.
export { NoticeHost, ensureNoticeHost } from './NoticeHost';
export {
  pushNotice,
  reportActionError,
  reportExportResult,
  runExport,
  useNoticeStore,
  type Notice,
  type NoticeTone,
} from './notices';
