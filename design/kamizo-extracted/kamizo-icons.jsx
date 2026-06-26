// kamizo-icons.jsx — minimal stroke icon set used across screens
// All 24x24 viewBox, currentColor strokes, 1.75 width.

const Icon = ({ children, size = 22, stroke = 1.75, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={stroke}
    strokeLinecap="round" strokeLinejoin="round" {...rest}>
    {children}
  </svg>
);

const IBell    = (p) => <Icon {...p}><path d="M6 8a6 6 0 1112 0c0 7 3 7 3 9H3c0-2 3-2 3-9z"/><path d="M10 21a2 2 0 004 0"/></Icon>;
const IBolt    = (p) => <Icon {...p}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z"/></Icon>;
const IDrop    = (p) => <Icon {...p}><path d="M12 3s7 7 7 12a7 7 0 11-14 0c0-5 7-12 7-12z"/></Icon>;
const IFlame   = (p) => <Icon {...p}><path d="M12 3c1 4 5 5 5 10a5 5 0 11-10 0c0-2 1-3 2-4 0 2 1 3 2 3-1-3 0-6 1-9z"/></Icon>;
const IBroom   = (p) => <Icon {...p}><path d="M19 4l-9 9"/><path d="M14 9l-7 7-3 4 4-3 7-7"/><path d="M8 21c0-3 4-3 4 0"/></Icon>;
const IWrench  = (p) => <Icon {...p}><path d="M14 7a4 4 0 105 5l-3-3 3-3a4 4 0 00-5 1z" fill="none"/><path d="M13 9L4 18a2 2 0 003 3l9-9"/></Icon>;
const IElevator= (p) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 9l3-3 3 3M9 15l3 3 3-3"/></Icon>;
const ILeaf    = (p) => <Icon {...p}><path d="M20 4c0 8-5 13-13 13a7 7 0 010-14c5 0 13 1 13 1z"/><path d="M14 10l-7 7"/></Icon>;
const IShield  = (p) => <Icon {...p}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6l8-3z"/></Icon>;
const ICar     = (p) => <Icon {...p}><path d="M5 13l2-5h10l2 5"/><rect x="3" y="13" width="18" height="6" rx="1.5"/><circle cx="7.5" cy="19" r="1.3"/><circle cx="16.5" cy="19" r="1.3"/></Icon>;
const IPaw     = (p) => <Icon {...p}><circle cx="6" cy="11" r="1.6"/><circle cx="10" cy="6" r="1.6"/><circle cx="14" cy="6" r="1.6"/><circle cx="18" cy="11" r="1.6"/><path d="M9 16c0-3 6-3 6 0 0 2-1.5 3-3 3s-3-1-3-3z"/></Icon>;
const IDots    = (p) => <Icon {...p}><circle cx="6" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="18" cy="12" r="1"/></Icon>;
const IChevronR= (p) => <Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>;
const IChevronD= (p) => <Icon {...p}><path d="M6 9l6 6 6-6"/></Icon>;
const IPlus    = (p) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
const ICheck   = (p) => <Icon {...p}><path d="M5 12l4 4 10-10"/></Icon>;
const IClose   = (p) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18"/></Icon>;
const IClock   = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></Icon>;
const ICamera  = (p) => <Icon {...p}><path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/></Icon>;
const IInfo    = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M12 11v6"/></Icon>;
const IUsers   = (p) => <Icon {...p}><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.5 3-6 6-6s6 2.5 6 6"/><circle cx="17" cy="9" r="2.8"/><path d="M15 14c2.5 0 6 1.5 6 4.5"/></Icon>;
const IHome    = (p) => <Icon {...p}><path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-4v-7H8v7H4a1 1 0 01-1-1z"/></Icon>;
const IGrid    = (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></Icon>;
const IUser    = (p) => <Icon {...p}><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.5 3.5-7 8-7s8 2.5 8 7"/></Icon>;
const ICalendar= (p) => <Icon {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></Icon>;
const IKey     = (p) => <Icon {...p}><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l3 3"/></Icon>;
const ITree    = (p) => <Icon {...p}><path d="M12 3l4 6h-2l3 5h-2l3 5H6l3-5H7l3-5H8z"/><path d="M12 19v3"/></Icon>;
const IDoc     = (p) => <Icon {...p}><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h4"/></Icon>;
const ISearch  = (p) => <Icon {...p}><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/></Icon>;
const IArrowR  = (p) => <Icon {...p}><path d="M5 12h14M13 6l6 6-6 6"/></Icon>;
const IArrowL  = (p) => <Icon {...p}><path d="M19 12H5M11 6l-6 6 6 6"/></Icon>;
const ISpark   = (p) => <Icon {...p}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/></Icon>;
const ICard    = (p) => <Icon {...p}><rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/></Icon>;
const IDownload= (p) => <Icon {...p}><path d="M12 4v12M6 12l6 6 6-6M4 21h16"/></Icon>;
const ITruck   = (p) => <Icon {...p}><rect x="2" y="7" width="11" height="9" rx="1"/><path d="M13 10h5l3 3v3h-8z"/><circle cx="6" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/></Icon>;
const IMegaphone=(p)=> <Icon {...p}><path d="M3 10v4h3l8 4V6L6 10z"/><path d="M17 9a4 4 0 010 6"/></Icon>;
const ITrash   = (p) => <Icon {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></Icon>;
const IUmbrella= (p) => <Icon {...p}><path d="M3 12a9 9 0 0118 0z"/><path d="M12 3v9M12 18a2 2 0 002 2"/></Icon>;
const ILock    = (p) => <Icon {...p}><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></Icon>;
const IQR      = (p) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14h1v1M14 20h3v1M20 17v4"/></Icon>;
const IPhone   = (p) => <Icon {...p}><path d="M5 4h4l2 5-3 2a11 11 0 005 5l2-3 5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z"/></Icon>;
const IMail    = (p) => <Icon {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 7 9-7"/></Icon>;
const IStar    = (p) => <Icon {...p}><path d="M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></Icon>;
const IGlobe   = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a13 13 0 010 18M12 3a13 13 0 000 18"/></Icon>;
const ILogout  = (p) => <Icon {...p}><path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M16 17l5-5-5-5M21 12H10"/></Icon>;
const IEdit    = (p) => <Icon {...p}><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M14 5l4 4"/></Icon>;
const IShare   = (p) => <Icon {...p}><circle cx="6" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="M8.2 11l6.6-3.5M8.2 13l6.6 3.5"/></Icon>;
const ICopy    = (p) => <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></Icon>;
const IFilter  = (p) => <Icon {...p}><path d="M3 5h18l-7 9v5l-4 2v-7z"/></Icon>;
const IFile    = (p) => <Icon {...p}><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></Icon>;
const IPin     = (p) => <Icon {...p}><path d="M12 2c4 0 7 3 7 7 0 5-7 13-7 13S5 14 5 9c0-4 3-7 7-7z"/><circle cx="12" cy="9" r="2.5"/></Icon>;
const IBuilding= (p) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></Icon>;
const IPackage = (p) => <Icon {...p}><path d="M3 7l9-4 9 4-9 4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/></Icon>;
const IHistory = (p) => <Icon {...p}><path d="M3 12a9 9 0 109-9 9 9 0 00-7 3.5"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/></Icon>;
const ICircle  = (p) => <Icon {...p}><circle cx="12" cy="12" r="9"/></Icon>;
const ISend    = (p) => <Icon {...p}><path d="M3 12l18-9-7 18-3-8z"/></Icon>;
const IChat    = (p) => <Icon {...p}><path d="M21 12a8 8 0 01-11.5 7.2L4 20l1-4.5A8 8 0 1121 12z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></Icon>;
const IGift    = (p) => <Icon {...p}><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8S10 3 7.5 4.5 9 8 12 8zM12 8s2-5 4.5-3.5S15 8 12 8z"/></Icon>;

Object.assign(window, {
  IBell, IBolt, IDrop, IFlame, IBroom, IWrench, IElevator, ILeaf, IShield,
  ICar, IPaw, IDots, IChevronR, IChevronD, IPlus, ICheck, IClose, IClock,
  ICamera, IInfo, IUsers, IHome, IGrid, IUser, ICalendar, IKey, ITree, IDoc,
  ISearch, IArrowR, IArrowL, ISpark, ICard, IDownload, ITruck, IMegaphone,
  ITrash, IUmbrella, ILock,
  IQR, IPhone, IMail, IStar, IGlobe, ILogout, IEdit, IShare, ICopy, IFilter,
  IFile, IPin, IBuilding, IPackage, IHistory, ICircle, ISend, IGift, IChat,
});
