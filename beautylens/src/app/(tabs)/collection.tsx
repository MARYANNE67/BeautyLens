

// /**
//  * Collection tab: the user's personal makeup bag.
//  *
//  * Feature 3 — Personal makeup bag:
//  * - Scan or manually add products
//  * - Opened date + PAO (Period After Opening) countdown
//  * - Printed expiry date from packaging
//  * - Push notifications when products are expiring
//  * - Star rating and shade match feedback
//  * - Saved shades from Shade Match
//  */
// import React, { useState, useCallback, useEffect } from 'react';
// import {
//   ScrollView,
//   StyleSheet,
//   Text,
//   View,
//   TouchableOpacity,
//   Alert,
//   Modal,
//   TextInput,
//   Pressable,
// // } from 'react-native';
// import { SafeAreaView } from 'react-native-safe-area-context';
// import { Ionicons } from '@expo/vector-icons';
// import { useFocusEffect } from 'expo-router';
// import AsyncStorage from '@react-native-async-storage/async-storage';
// import * as Notifications from 'expo-notifications';

// import { MUTED, PAGE_BG, PINK, PINK_SOFT, SERIF, TEXT } from '../../components/ProfileFields';

// // ── Notification setup ────────────────────────────────────────────────────────

// Notifications.setNotificationHandler({
//   handleNotification: async () => ({
//     shouldShowAlert: true,
//     shouldPlaySound: true,
//     shouldSetBadge: true,
//   }),
// });

// async function requestNotificationPermission(): Promise<boolean> {
//   const { status: existing } = await Notifications.getPermissionsAsync();
//   if (existing === 'granted') return true;
//   const { status } = await Notifications.requestPermissionsAsync();
//   return status === 'granted';
// }

// async function scheduleExpiryNotification(
//   productName: string,
//   daysUntil: number,
//   type: 'printed' | 'pao'
// ): Promise<string | null> {
//   try {
//     const granted = await requestNotificationPermission();
//     if (!granted) return null;

//     const seconds = daysUntil * 24 * 60 * 60;
//     if (seconds <= 0) return null;

//     const body =
//       type === 'printed'
//         ? `${productName} reaches its printed expiry date in ${daysUntil} days. Time to replace it.`
//         : `${productName} has been open for its recommended period. Consider replacing it.`;

//     const id = await Notifications.scheduleNotificationAsync({
//       content: {
//         title: '💄 BeautyLens — Product expiring',
//         body,
//         data: { productName, type },
//         sound: true,
//       },
//       trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds },
//     });
//     return id;
//   } catch (e) {
//     console.error('[Notifications] Schedule error:', e);
//     return null;
//   }
// }

// async function cancelNotification(id: string) {
//   try {
//     await Notifications.cancelScheduledNotificationAsync(id);
//   } catch {}
// }

// // ── Types ─────────────────────────────────────────────────────────────────────

// export interface SavedProduct {
//   id: string;
//   brand?: string;
//   productName?: string;
//   displayName: string;
//   label: string;
//   shade?: string;
//   confidence: number;
//   savedAt: string;
//   openedAt?: string;
//   expiryDate?: string;      // printed expiry on packaging e.g. "2026-12-01"
//   paoMonths?: number;       // Period After Opening override
//   rating?: number;
//   matchFeedback?: 'great' | 'ok' | 'poor';
//   printedExpiryNotifId?: string;
//   paoNotifId?: string;
// }

// export interface SavedShade {
//   id: string;
//   brand: string;
//   productName: string;
//   shade: string;
//   undertone?: string;
//   hexColor?: string;
//   savedAt: string;
// }

// export const COLLECTION_KEY = 'beautylens:collection';
// export const SHADES_KEY = 'beautylens:saved_shades';

// // Default PAO (Period After Opening) in months per category
// const DEFAULT_PAO: Record<string, number> = {
//   mascara: 3,
//   'eye liner': 6,
//   'eye shadow': 12,
//   foundation: 12,
//   concealer: 12,
//   powder: 24,
//   blush: 24,
//   bronzer: 24,
//   highlighter: 24,
//   'lip stick': 12,
//   'lip gloss': 12,
//   'lip liner': 12,
//   primer: 12,
//   'setting spray': 12,
// };

// // ── Storage helpers ───────────────────────────────────────────────────────────

// export async function saveProductToCollection(product: {
//   id: string;
//   brand?: string;
//   productName?: string;
//   displayName?: string;
//   label: string;
//   shade?: string;
//   confidence: number;
//   expiryDate?: string;
//   paoMonths?: number;
// }): Promise<void> {
//   try {
//     const existing = await loadCollection();
//     const filtered = existing.filter((p) => p.id !== product.id);
//     const newItem: SavedProduct = {
//       ...product,
//       displayName: product.displayName || product.label,
//       savedAt: new Date().toISOString(),
//     };

//     // Schedule printed expiry notification if date provided
//     if (product.expiryDate) {
//       const daysUntil = Math.floor(
//         (new Date(product.expiryDate).getTime() - Date.now()) / 86400000
//       );
//       if (daysUntil > 30) {
//         const notifId = await scheduleExpiryNotification(
//           newItem.displayName,
//           daysUntil - 30, // notify 30 days before
//           'printed'
//         );
//         if (notifId) newItem.printedExpiryNotifId = notifId;
//       }
//     }

//     await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify([newItem, ...filtered]));
//   } catch (e) {
//     console.error('[Collection] Save error:', e);
//   }
// }

// export async function loadCollection(): Promise<SavedProduct[]> {
//   try {
//     const raw = await AsyncStorage.getItem(COLLECTION_KEY);
//     return raw ? JSON.parse(raw) : [];
//   } catch {
//     return [];
//   }
// }

// export async function saveShadeToCollection(
//   shade: Omit<SavedShade, 'id' | 'savedAt'>
// ): Promise<void> {
//   try {
//     const existing = await loadSavedShades();
//     const id = `shade-${Date.now()}`;
//     await AsyncStorage.setItem(
//       SHADES_KEY,
//       JSON.stringify([{ ...shade, id, savedAt: new Date().toISOString() }, ...existing])
//     );
//   } catch (e) {
//     console.error('[Shades] Save error:', e);
//   }
// }

// export async function loadSavedShades(): Promise<SavedShade[]> {
//   try {
//     const raw = await AsyncStorage.getItem(SHADES_KEY);
//     return raw ? JSON.parse(raw) : [];
//   } catch {
//     return [];
//   }
// }

// async function updateProduct(
//   id: string,
//   updates: Partial<SavedProduct>
// ): Promise<SavedProduct[]> {
//   const existing = await loadCollection();
//   const updated = existing.map((p) => (p.id === id ? { ...p, ...updates } : p));
//   await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(updated));
//   return updated;
// }

// async function removeProduct(id: string): Promise<SavedProduct[]> {
//   const existing = await loadCollection();
//   const toRemove = existing.find((p) => p.id === id);
//   if (toRemove?.printedExpiryNotifId) await cancelNotification(toRemove.printedExpiryNotifId);
//   if (toRemove?.paoNotifId) await cancelNotification(toRemove.paoNotifId);
//   const updated = existing.filter((p) => p.id !== id);
//   await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(updated));
//   return updated;
// }

// async function removeShade(id: string): Promise<SavedShade[]> {
//   const existing = await loadSavedShades();
//   const updated = existing.filter((s) => s.id !== id);
//   await AsyncStorage.setItem(SHADES_KEY, JSON.stringify(updated));
//   return updated;
// }

// // ── Expiry helpers ────────────────────────────────────────────────────────────

// function daysOpen(openedAt: string): number {
//   return Math.floor((Date.now() - new Date(openedAt).getTime()) / 86400000);
// }

// function daysUntilExpiry(expiryDate: string): number {
//   return Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000);
// }

// function paoStatus(
//   label: string,
//   openedAt: string,
//   paoMonths?: number
// ): { status: 'ok' | 'soon' | 'expired'; daysLeft: number } {
//   const months = paoMonths ?? DEFAULT_PAO[label.toLowerCase()] ?? 12;
//   const limitDays = months * 30;
//   const used = daysOpen(openedAt);
//   const daysLeft = limitDays - used;
//   if (daysLeft <= 0) return { status: 'expired', daysLeft: 0 };
//   if (daysLeft <= 30) return { status: 'soon', daysLeft };
//   return { status: 'ok', daysLeft };
// }

// function parseExpiryInput(input: string): string | null {
//   // Accept MM/YYYY or MM/YY
//   const match = input.match(/^(\d{1,2})[\/-](\d{2,4})$/);
//   if (!match) return null;
//   const month = parseInt(match[1]) - 1;
//   const year = match[2].length === 2 ? 2000 + parseInt(match[2]) : parseInt(match[2]);
//   const date = new Date(year, month, 1);
//   if (isNaN(date.getTime())) return null;
//   return date.toISOString().split('T')[0];
// }

// // ── Sub-components ────────────────────────────────────────────────────────────

// function StarRating({
//   value,
//   onChange,
// }: {
//   value?: number;
//   onChange: (n: number) => void;
// }) {
//   return (
//     <View style={{ flexDirection: 'row', gap: 3, marginTop: 5 }}>
//       {[1, 2, 3, 4, 5].map((n) => (
//         <TouchableOpacity
//           key={n}
//           onPress={() => onChange(n)}
//           hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
//         >
//           <Ionicons
//             name={n <= (value ?? 0) ? 'star' : 'star-outline'}
//             size={15}
//             color={n <= (value ?? 0) ? '#F9C74F' : '#ccc'}
//           />
//         </TouchableOpacity>
//       ))}
//     </View>
//   );
// }

// function ExpiryIndicator({
//   product,
//   onMarkOpened,
// }: {
//   product: SavedProduct;
//   onMarkOpened: () => void;
// }) {
//   const lines: React.ReactNode[] = [];

//   // Printed expiry
//   if (product.expiryDate) {
//     const days = daysUntilExpiry(product.expiryDate);
//     const expired = days <= 0;
//     const soon = days > 0 && days <= 60;
//     lines.push(
//       <View key="printed" style={styles.expiryRow}>
//         <Ionicons
//           name="calendar"
//           size={12}
//           color={expired ? '#C62828' : soon ? '#E65100' : '#2E7D32'}
//         />
//         <Text
//           style={[
//             styles.expiryText,
//             expired && { color: '#C62828' },
//             soon && { color: '#E65100' },
//           ]}
//         >
//           {expired
//             ? `Expired ${Math.abs(days)} days ago`
//             : soon
//             ? `Expires in ${days} days`
//             : `Expires ${new Date(product.expiryDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
//         </Text>
//       </View>
//     );
//   }

//   // PAO countdown
//   if (product.openedAt) {
//     const { status, daysLeft } = paoStatus(product.label, product.openedAt, product.paoMonths);
//     const paoMonths = product.paoMonths ?? DEFAULT_PAO[product.label.toLowerCase()] ?? 12;
//     lines.push(
//       <View key="pao" style={styles.expiryRow}>
//         <Ionicons
//           name="time-outline"
//           size={12}
//           color={status === 'expired' ? '#C62828' : status === 'soon' ? '#E65100' : '#2E7D32'}
//         />
//         <Text
//           style={[
//             styles.expiryText,
//             status === 'expired' && { color: '#C62828' },
//             status === 'soon' && { color: '#E65100' },
//           ]}
//         >
//           {status === 'expired'
//             ? `Past ${paoMonths}M use-by period`
//             : status === 'soon'
//             ? `Replace in ${daysLeft} days (${paoMonths}M period)`
//             : `${daysLeft} days left of ${paoMonths}M period`}
//         </Text>
//       </View>
//     );
//   } else {
//     lines.push(
//       <TouchableOpacity key="open" style={styles.openButton} onPress={onMarkOpened}>
//         <Ionicons name="calendar-outline" size={12} color={PINK} />
//         <Text style={styles.openButtonText}>Mark as opened</Text>
//       </TouchableOpacity>
//     );
//   }

//   return <>{lines}</>;
// }

// // ── Add / Edit product modal ──────────────────────────────────────────────────

// function AddProductModal({
//   visible,
//   onClose,
//   onSave,
// }: {
//   visible: boolean;
//   onClose: () => void;
//   onSave: (p: Partial<SavedProduct>) => void;
// }) {
//   const [brand, setBrand] = useState('');
//   const [name, setName] = useState('');
//   const [shade, setShade] = useState('');
//   const [label, setLabel] = useState('');
//   const [expiry, setExpiry] = useState('');
//   const [expiryError, setExpiryError] = useState('');

//   const handleSave = () => {
//     if (!name.trim() && !brand.trim()) {
//       Alert.alert('Add a product name or brand');
//       return;
//     }
//     let expiryDate: string | undefined;
//     if (expiry.trim()) {
//       const parsed = parseExpiryInput(expiry.trim());
//       if (!parsed) {
//         setExpiryError('Use format MM/YYYY e.g. 06/2027');
//         return;
//       }
//       expiryDate = parsed;
//     }
//     setExpiryError('');
//     onSave({
//       brand: brand.trim() || undefined,
//       productName: name.trim() || undefined,
//       shade: shade.trim() || undefined,
//       label: label.trim() || 'product',
//       displayName: name.trim() || brand.trim(),
//       confidence: 1,
//       expiryDate,
//     });
//     setBrand(''); setName(''); setShade(''); setLabel(''); setExpiry('');
//     onClose();
//   };

//   return (
//     <Modal
//       visible={visible}
//       animationType="slide"
//       presentationStyle="pageSheet"
//       onRequestClose={onClose}
//     >
//       <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }}>
//         <View style={styles.modalHeader}>
//           <Text style={styles.modalTitle}>Add product</Text>
//           <TouchableOpacity onPress={onClose}>
//             <Ionicons name="close" size={24} color={TEXT} />
//           </TouchableOpacity>
//         </View>
//         <ScrollView style={{ padding: 20 }}>
//           {[
//             { label: 'Brand', value: brand, set: setBrand, placeholder: 'e.g. MAC, NARS, Fenty Beauty' },
//             { label: 'Product name', value: name, set: setName, placeholder: 'e.g. Studio Fix Fluid SPF 15' },
//             { label: 'Shade', value: shade, set: setShade, placeholder: 'e.g. NW45, 220, Caramel' },
//             { label: 'Category', value: label, set: setLabel, placeholder: 'e.g. foundation, mascara, blush' },
//           ].map((field) => (
//             <View key={field.label} style={{ marginBottom: 16 }}>
//               <Text style={styles.inputLabel}>{field.label}</Text>
//               <TextInput
//                 style={styles.input}
//                 value={field.value}
//                 onChangeText={field.set}
//                 placeholder={field.placeholder}
//                 placeholderTextColor="#C4A8B3"
//               />
//             </View>
//           ))}

//           {/* Expiry date */}
//           <View style={{ marginBottom: 16 }}>
//             <Text style={styles.inputLabel}>Expiry date (from packaging)</Text>
//             <TextInput
//               style={[styles.input, expiryError ? { borderColor: '#C62828' } : {}]}
//               value={expiry}
//               onChangeText={(t) => { setExpiry(t); setExpiryError(''); }}
//               placeholder="MM/YYYY  e.g. 06/2027"
//               placeholderTextColor="#C4A8B3"
//               keyboardType="numbers-and-punctuation"
//             />
//             {expiryError ? (
//               <Text style={{ color: '#C62828', fontSize: 12, marginTop: 4 }}>{expiryError}</Text>
//             ) : (
//               <Text style={styles.inputHint}>
//                 Check the bottom or back of the packaging for a date or hourglass symbol
//               </Text>
//             )}
//           </View>

//           <View style={styles.paoNote}>
//             <Ionicons name="information-circle-outline" size={16} color={PINK} />
//             <Text style={styles.paoNoteText}>
//               Once you mark the product as opened, BeautyLens will also track the
//               recommended use-by period (e.g. 3 months for mascara, 12 months for foundation)
//               and remind you when it's time to replace it.
//             </Text>
//           </View>

//           <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
//             <Text style={styles.saveBtnText}>Add to collection</Text>
//           </TouchableOpacity>
//         </ScrollView>
//       </SafeAreaView>
//     </Modal>
//   );
// }

// // ── Main screen ───────────────────────────────────────────────────────────────

// type TabKey = 'products' | 'shades';

// export default function CollectionScreen() {
//   const [products, setProducts] = useState<SavedProduct[]>([]);
//   const [shades, setShades] = useState<SavedShade[]>([]);
//   const [loading, setLoading] = useState(true);
//   const [tab, setTab] = useState<TabKey>('products');
//   const [showAdd, setShowAdd] = useState(false);
//   const [matchTarget, setMatchTarget] = useState<string | null>(null);

//   useFocusEffect(
//     useCallback(() => {
//       Promise.all([loadCollection(), loadSavedShades()]).then(([p, s]) => {
//         setProducts(p);
//         setShades(s);
//         setLoading(false);
//       });
//     }, [])
//   );

//   // Check for expiring products on tab focus and show a banner
//   useEffect(() => {
//     if (!products.length) return;
//     const expiring = products.filter((p) => {
//       if (p.expiryDate && daysUntilExpiry(p.expiryDate) <= 30) return true;
//       if (p.openedAt) {
//         const { status } = paoStatus(p.label, p.openedAt, p.paoMonths);
//         return status !== 'ok';
//       }
//       return false;
//     });
//     if (expiring.length > 0) {
//       Alert.alert(
//         '💄 Products expiring soon',
//         `${expiring.length} product${expiring.length > 1 ? 's' : ''} in your collection ${expiring.length > 1 ? 'are' : 'is'} expiring or past the recommended use-by period.`,
//         [{ text: 'Got it' }]
//       );
//     }
//   }, [products]);

//   const handleMarkOpened = async (id: string, label: string, displayName: string) => {
//     const openedAt = new Date().toISOString();
//     const paoMonths = DEFAULT_PAO[label.toLowerCase()] ?? 12;
//     const paoLimitDays = paoMonths * 30;

//     // Schedule PAO notification
//     const paoNotifId = await scheduleExpiryNotification(displayName, paoLimitDays, 'pao');
//     const updated = await updateProduct(id, {
//       openedAt,
//       paoNotifId: paoNotifId ?? undefined,
//     });
//     setProducts(updated);
//   };

//   const handleRate = async (id: string, rating: number) => {
//     const updated = await updateProduct(id, { rating });
//     setProducts(updated);
//   };

//   const handleMatchFeedback = async (id: string, feedback: 'great' | 'ok' | 'poor') => {
//     const updated = await updateProduct(id, { matchFeedback: feedback });
//     setProducts(updated);
//     setMatchTarget(null);
//   };

//   const handleRemoveProduct = (id: string, name: string) => {
//     Alert.alert('Remove product', `Remove ${name} from your collection?`, [
//       { text: 'Cancel', style: 'cancel' },
//       {
//         text: 'Remove',
//         style: 'destructive',
//         onPress: async () => {
//           const updated = await removeProduct(id);
//           setProducts(updated);
//         },
//       },
//     ]);
//   };

//   const handleManualAdd = async (p: Partial<SavedProduct>) => {
//     await saveProductToCollection({
//       id: `manual-${Date.now()}`,
//       brand: p.brand,
//       productName: p.productName,
//       displayName: p.displayName || p.productName || 'Product',
//       label: p.label || 'product',
//       shade: p.shade,
//       confidence: 1,
//       expiryDate: p.expiryDate,
//     });
//     const updated = await loadCollection();
//     setProducts(updated);
//   };

//   const handleRemoveShade = async (id: string) => {
//     const updated = await removeShade(id);
//     setShades(updated);
//   };

//   if (loading) {
//     return (
//       <SafeAreaView style={styles.safe} edges={['top']}>
//         <Text style={styles.screenTitle}>Collection</Text>
//       </SafeAreaView>
//     );
//   }

//   return (
//     <SafeAreaView style={styles.safe} edges={['top']}>
//       {/* Header */}
//       <View style={styles.headerRow}>
//         <Text style={styles.screenTitle}>Collection</Text>
//         {tab === 'products' && (
//           <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
//             <Ionicons name="add" size={20} color={PINK} />
//             <Text style={styles.addBtnText}>Add</Text>
//           </TouchableOpacity>
//         )}
//       </View>

//       {/* Tabs */}
//       <View style={styles.tabs}>
//         {(['products', 'shades'] as TabKey[]).map((t) => (
//           <TouchableOpacity
//             key={t}
//             style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
//             onPress={() => setTab(t)}
//           >
//             <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
//               {t === 'products'
//                 ? `Products${products.length ? ` (${products.length})` : ''}`
//                 : `Saved shades${shades.length ? ` (${shades.length})` : ''}`}
//             </Text>
//           </TouchableOpacity>
//         ))}
//       </View>

//       <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

//         {/* ── Products tab ── */}
//         {tab === 'products' && (
//           products.length === 0 ? (
//             <View style={styles.emptyCard}>
//               <View style={styles.emptyIcon}>
//                 <Ionicons name="bag-handle-outline" size={38} color={PINK} />
//               </View>
//               <Text style={styles.emptyTitle}>Your makeup bag is empty</Text>
//               <Text style={styles.emptyBody}>
//                 Scan a product and tap &quot;Save to Collection&quot;, or tap Add to add manually.
//               </Text>
//             </View>
//           ) : (
//             <View style={styles.group}>
//               {products.map((product, i) => {
//                 const displayName = product.brand
//                   ? `${product.brand} ${product.productName || product.displayName}`
//                   : product.productName || product.displayName;

//                 return (
//                   <View
//                     key={product.id}
//                     style={[
//                       styles.productRow,
//                       i < products.length - 1 && styles.rowDivider,
//                     ]}
//                   >
//                     <View style={styles.rowIcon}>
//                       <Ionicons name="cube-outline" size={18} color={PINK} />
//                     </View>

//                     <View style={{ flex: 1 }}>
//                       {product.brand && (
//                         <View style={styles.brandBadge}>
//                           <Text style={styles.brandBadgeText}>{product.brand}</Text>
//                         </View>
//                       )}

//                       <Text style={styles.rowLabel} numberOfLines={2}>
//                         {displayName}
//                       </Text>

//                       {product.shade && (
//                         <Text style={styles.shadeText}>Shade: {product.shade}</Text>
//                       )}

//                       {/* Star rating */}
//                       <StarRating
//                         value={product.rating}
//                         onChange={(n) => handleRate(product.id, n)}
//                       />

//                       {/* Match feedback */}
//                       <TouchableOpacity
//                         style={[
//                           styles.matchBadge,
//                           {
//                             backgroundColor:
//                               product.matchFeedback === 'great' ? '#E8F5E9'
//                               : product.matchFeedback === 'ok' ? '#FFF3E0'
//                               : product.matchFeedback === 'poor' ? '#FFEBEE'
//                               : PINK_SOFT,
//                           },
//                         ]}
//                         onPress={() => setMatchTarget(product.id)}
//                       >
//                         <Text
//                           style={[
//                             styles.matchBadgeText,
//                             {
//                               color:
//                                 product.matchFeedback === 'great' ? '#2E7D32'
//                                 : product.matchFeedback === 'ok' ? '#E65100'
//                                 : product.matchFeedback === 'poor' ? '#C62828'
//                                 : PINK,
//                             },
//                           ]}
//                         >
//                           {product.matchFeedback === 'great' ? '✅ Great match'
//                             : product.matchFeedback === 'ok' ? '🟡 OK match'
//                             : product.matchFeedback === 'poor' ? '❌ Poor match'
//                             : 'Rate shade match'}
//                         </Text>
//                       </TouchableOpacity>

//                       {/* Expiry indicators */}
//                       <ExpiryIndicator
//                         product={product}
//                         onMarkOpened={() =>
//                           handleMarkOpened(product.id, product.label, displayName)
//                         }
//                       />

//                       <Text style={styles.savedDate}>
//                         Saved{' '}
//                         {new Date(product.savedAt).toLocaleDateString('en-US', {
//                           month: 'short', day: 'numeric', year: 'numeric',
//                         })}
//                       </Text>
//                     </View>

//                     <TouchableOpacity
//                       style={styles.removeButton}
//                       onPress={() => handleRemoveProduct(product.id, displayName)}
//                       hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
//                     >
//                       <Ionicons name="trash-outline" size={16} color="#ccc" />
//                     </TouchableOpacity>
//                   </View>
//                 );
//               })}
//             </View>
//           )
//         )}

//         {/* ── Shades tab ── */}
//         {tab === 'shades' && (
//           shades.length === 0 ? (
//             <View style={styles.emptyCard}>
//               <View style={styles.emptyIcon}>
//                 <Ionicons name="color-palette-outline" size={38} color={PINK} />
//               </View>
//               <Text style={styles.emptyTitle}>No saved shades yet</Text>
//               <Text style={styles.emptyBody}>
//                 Run a Shade Match and save the shades you like — they'll appear here.
//               </Text>
//             </View>
//           ) : (
//             <View style={styles.group}>
//               {shades.map((shade, i) => (
//                 <View
//                   key={shade.id}
//                   style={[styles.productRow, i < shades.length - 1 && styles.rowDivider]}
//                 >
//                   {shade.hexColor ? (
//                     <View style={[styles.colorSwatch, { backgroundColor: shade.hexColor }]} />
//                   ) : (
//                     <View style={styles.rowIcon}>
//                       <Ionicons name="bookmark" size={18} color={PINK} />
//                     </View>
//                   )}
//                   <View style={{ flex: 1 }}>
//                     <View style={styles.brandBadge}>
//                       <Text style={styles.brandBadgeText}>{shade.brand}</Text>
//                     </View>
//                     <Text style={styles.rowLabel}>{shade.productName}</Text>
//                     <Text style={styles.shadeText}>{shade.shade}</Text>
//                     {shade.undertone && (
//                       <Text style={styles.savedDate}>Undertone: {shade.undertone}</Text>
//                     )}
//                     <Text style={styles.savedDate}>
//                       Saved{' '}
//                       {new Date(shade.savedAt).toLocaleDateString('en-US', {
//                         month: 'short', day: 'numeric', year: 'numeric',
//                       })}
//                     </Text>
//                   </View>
//                   <TouchableOpacity
//                     style={styles.removeButton}
//                     onPress={() => handleRemoveShade(shade.id)}
//                     hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
//                   >
//                     <Ionicons name="trash-outline" size={16} color="#ccc" />
//                   </TouchableOpacity>
//                 </View>
//               ))}
//             </View>
//           )
//         )}
//       </ScrollView>

//       {/* Match feedback modal */}
//       <Modal
//         visible={matchTarget !== null}
//         transparent
//         animationType="fade"
//         onRequestClose={() => setMatchTarget(null)}
//       >
//         <Pressable style={styles.overlay} onPress={() => setMatchTarget(null)}>
//           <View style={styles.matchModal}>
//             <Text style={styles.matchModalTitle}>How was the shade match?</Text>
//             {(['great', 'ok', 'poor'] as const).map((fb) => (
//               <TouchableOpacity
//                 key={fb}
//                 style={styles.matchOption}
//                 onPress={() => matchTarget && handleMatchFeedback(matchTarget, fb)}
//               >
//                 <Text style={styles.matchOptionText}>
//                   {fb === 'great' ? '✅  Great match'
//                     : fb === 'ok' ? '🟡  OK match'
//                     : '❌  Poor match'}
//                 </Text>
//               </TouchableOpacity>
//             ))}
//           </View>
//         </Pressable>
//       </Modal>

//       {/* Manual add modal */}
//       <AddProductModal
//         visible={showAdd}
//         onClose={() => setShowAdd(false)}
//         onSave={handleManualAdd}
//       />
//     </SafeAreaView>
//   );
// }

// // ── Styles ────────────────────────────────────────────────────────────────────

// const styles = StyleSheet.create({
//   safe: { flex: 1, backgroundColor: PAGE_BG },
//   scroll: { paddingHorizontal: 14, paddingBottom: 40 },
//   headerRow: {
//     flexDirection: 'row', alignItems: 'center',
//     justifyContent: 'space-between',
//     paddingHorizontal: 18, marginTop: 10, marginBottom: 4,
//   },
//   screenTitle: { fontFamily: SERIF, fontSize: 28, fontWeight: '700', color: TEXT },
//   addBtn: {
//     flexDirection: 'row', alignItems: 'center', gap: 4,
//     backgroundColor: PINK_SOFT, paddingHorizontal: 12,
//     paddingVertical: 6, borderRadius: 20,
//   },
//   addBtnText: { fontSize: 14, fontWeight: '700', color: PINK },
//   tabs: {
//     flexDirection: 'row', marginHorizontal: 14, marginBottom: 14,
//     backgroundColor: '#F0E6EC', borderRadius: 12, padding: 3,
//   },
//   tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
//   tabBtnActive: {
//     backgroundColor: '#fff',
//     shadowColor: '#B9718F', shadowOffset: { width: 0, height: 1 },
//     shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
//   },
//   tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
//   tabTextActive: { color: PINK },
//   emptyCard: {
//     backgroundColor: '#fff', borderRadius: 20,
//     paddingVertical: 34, paddingHorizontal: 24, alignItems: 'center',
//     shadowColor: '#B9718F', shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
//   },
//   emptyIcon: {
//     width: 76, height: 76, borderRadius: 38,
//     backgroundColor: PINK_SOFT,
//     justifyContent: 'center', alignItems: 'center', marginBottom: 16,
//   },
//   emptyTitle: { fontSize: 19, fontWeight: '800', color: TEXT, marginBottom: 6 },
//   emptyBody: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
//   group: {
//     backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden',
//     shadowColor: '#B9718F', shadowOffset: { width: 0, height: 2 },
//     shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
//   },
//   productRow: {
//     flexDirection: 'row', alignItems: 'flex-start',
//     gap: 12, paddingHorizontal: 16, paddingVertical: 14,
//   },
//   rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F1E4EA' },
//   rowIcon: {
//     width: 36, height: 36, borderRadius: 18,
//     backgroundColor: PINK_SOFT,
//     justifyContent: 'center', alignItems: 'center', flexShrink: 0,
//   },
//   colorSwatch: {
//     width: 36, height: 36, borderRadius: 18,
//     flexShrink: 0, borderWidth: 1, borderColor: '#eee',
//   },
//   rowLabel: { fontSize: 15, fontWeight: '700', color: TEXT },
//   brandBadge: {
//     alignSelf: 'flex-start', backgroundColor: PINK_SOFT,
//     paddingHorizontal: 8, paddingVertical: 2,
//     borderRadius: 8, marginBottom: 4,
//   },
//   brandBadgeText: {
//     fontSize: 10, fontWeight: '700', color: PINK,
//     textTransform: 'uppercase', letterSpacing: 0.6,
//   },
//   shadeText: { fontSize: 12, color: PINK, fontWeight: '600', marginTop: 2 },
//   savedDate: { fontSize: 11.5, color: MUTED, marginTop: 4 },
//   expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
//   expiryText: { fontSize: 12, color: '#2E7D32', fontWeight: '500' },
//   openButton: {
//     flexDirection: 'row', alignItems: 'center', gap: 4,
//     marginTop: 5, alignSelf: 'flex-start',
//   },
//   openButtonText: { fontSize: 12, color: PINK, fontWeight: '500' },
//   removeButton: { padding: 4, marginTop: 2 },
//   matchBadge: {
//     alignSelf: 'flex-start', paddingHorizontal: 8,
//     paddingVertical: 3, borderRadius: 8, marginTop: 5,
//   },
//   matchBadgeText: { fontSize: 11, fontWeight: '600' },
//   overlay: {
//     flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
//     justifyContent: 'center', alignItems: 'center',
//   },
//   matchModal: {
//     backgroundColor: '#fff', borderRadius: 20,
//     padding: 24, width: '80%', gap: 12,
//   },
//   matchModalTitle: {
//     fontSize: 17, fontWeight: '700', color: TEXT,
//     textAlign: 'center', marginBottom: 4,
//   },
//   matchOption: {
//     paddingVertical: 12, paddingHorizontal: 16,
//     backgroundColor: PAGE_BG, borderRadius: 12,
//   },
//   matchOptionText: { fontSize: 15, fontWeight: '600', color: TEXT },
//   modalHeader: {
//     flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
//     padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1E4EA',
//   },
//   modalTitle: { fontFamily: SERIF, fontSize: 22, fontWeight: '700', color: TEXT },
//   inputLabel: { fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 6 },
//   input: {
//     backgroundColor: '#fff', borderRadius: 12,
//     paddingHorizontal: 14, paddingVertical: 12,
//     fontSize: 15, color: TEXT, borderWidth: 1, borderColor: '#F1E4EA',
//   },
//   inputHint: { fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 16 },
//   paoNote: {
//     flexDirection: 'row', gap: 8, alignItems: 'flex-start',
//     backgroundColor: PINK_SOFT, borderRadius: 12,
//     padding: 12, marginBottom: 20,
//   },
//   paoNoteText: { flex: 1, fontSize: 12.5, color: PINK, lineHeight: 18 },
//   saveBtn: {
//     backgroundColor: PINK, paddingVertical: 16,
//     borderRadius: 14, alignItems: 'center', marginTop: 8,
//   },
//   saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
// });


/**
 * Collection tab: the user's personal makeup bag.
 *
 * Feature 3 — Personal makeup bag:
 * - Scan or manually add products
 * - Opened date + PAO (Period After Opening) countdown
 * - Printed expiry date from packaging
 * - Push notifications when products are expiring
 * - Star rating and shade match feedback
 * - Saved shades from Shade Match
 */
import React, { useState, useCallback, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
// expo-notifications removed — free Apple accounts don't support aps-environment entitlement.
// Expiry alerts are handled in-app via Alert.alert in the useEffect below.

import { MUTED, PAGE_BG, PINK, PINK_SOFT, SERIF, TEXT } from '../../components/ProfileFields';

// ── Notification stubs (expo-notifications removed for free Apple account compatibility) ──

async function scheduleExpiryNotification(
  _productName: string,
  _daysUntil: number,
  _type: 'printed' | 'pao'
): Promise<string | null> {
  return null;
}

async function cancelNotification(_id: string) {
  // no-op
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SavedProduct {
  id: string;
  brand?: string;
  productName?: string;
  displayName: string;
  label: string;
  shade?: string;
  confidence: number;
  savedAt: string;
  openedAt?: string;
  expiryDate?: string;      // printed expiry on packaging e.g. "2026-12-01"
  paoMonths?: number;       // Period After Opening override
  rating?: number;
  matchFeedback?: 'great' | 'ok' | 'poor';
  printedExpiryNotifId?: string;
  paoNotifId?: string;
  notes?: string;
}

export interface SavedShade {
  id: string;
  brand: string;
  productName: string;
  shade: string;
  undertone?: string;
  hexColor?: string;
  savedAt: string;
  /** shade_id from the recommendations catalog, when saved from Shade Match.
   *  Lets callers dedupe/toggle a save without tracking our internal `id`. */
  sourceShadeId?: number;
}

export const COLLECTION_KEY = 'beautylens:collection';
export const SHADES_KEY = 'beautylens:saved_shades';

// Default PAO (Period After Opening) in months per category
const DEFAULT_PAO: Record<string, number> = {
  mascara: 3,
  'eye liner': 6,
  'eye shadow': 12,
  foundation: 12,
  concealer: 12,
  powder: 24,
  blush: 24,
  bronzer: 24,
  highlighter: 24,
  'lip stick': 12,
  'lip gloss': 12,
  'lip liner': 12,
  primer: 12,
  'setting spray': 12,
};

// ── Storage helpers ───────────────────────────────────────────────────────────

export async function saveProductToCollection(product: {
  id: string;
  brand?: string;
  productName?: string;
  displayName?: string;
  label: string;
  shade?: string;
  confidence: number;
  expiryDate?: string;
  paoMonths?: number;
}): Promise<void> {
  try {
    const existing = await loadCollection();
    const filtered = existing.filter((p) => p.id !== product.id);
    const newItem: SavedProduct = {
      ...product,
      displayName: product.displayName || product.label,
      savedAt: new Date().toISOString(),
    };

    // Schedule printed expiry notification if date provided
    if (product.expiryDate) {
      const daysUntil = Math.floor(
        (new Date(product.expiryDate).getTime() - Date.now()) / 86400000
      );
      if (daysUntil > 30) {
        const notifId = await scheduleExpiryNotification(
          newItem.displayName,
          daysUntil - 30, // notify 30 days before
          'printed'
        );
        if (notifId) newItem.printedExpiryNotifId = notifId;
      }
    }

    await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify([newItem, ...filtered]));
  } catch (e) {
    console.error('[Collection] Save error:', e);
  }
}

export async function loadCollection(): Promise<SavedProduct[]> {
  try {
    const raw = await AsyncStorage.getItem(COLLECTION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveShadeToCollection(
  shade: Omit<SavedShade, 'id' | 'savedAt'>
): Promise<void> {
  try {
    const existing = await loadSavedShades();
    // Re-saving the same catalog shade updates it in place rather than
    // duplicating — the recommendations screen calls this on every tap of
    // its save toggle, with no separate "already saved" check beforehand.
    const withoutDupe =
      shade.sourceShadeId != null
        ? existing.filter((s) => s.sourceShadeId !== shade.sourceShadeId)
        : existing;
    const id = `shade-${Date.now()}`;
    await AsyncStorage.setItem(
      SHADES_KEY,
      JSON.stringify([{ ...shade, id, savedAt: new Date().toISOString() }, ...withoutDupe])
    );
  } catch (e) {
    console.error('[Shades] Save error:', e);
  }
}

export async function loadSavedShades(): Promise<SavedShade[]> {
  try {
    const raw = await AsyncStorage.getItem(SHADES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function updateProduct(
  id: string,
  updates: Partial<SavedProduct>
): Promise<SavedProduct[]> {
  const existing = await loadCollection();
  const updated = existing.map((p) => (p.id === id ? { ...p, ...updates } : p));
  await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(updated));
  return updated;
}

async function removeProduct(id: string): Promise<SavedProduct[]> {
  const existing = await loadCollection();
  const toRemove = existing.find((p) => p.id === id);
  if (toRemove?.printedExpiryNotifId) await cancelNotification(toRemove.printedExpiryNotifId);
  if (toRemove?.paoNotifId) await cancelNotification(toRemove.paoNotifId);
  const updated = existing.filter((p) => p.id !== id);
  await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(updated));
  return updated;
}

export async function removeShade(id: string): Promise<SavedShade[]> {
  const existing = await loadSavedShades();
  const updated = existing.filter((s) => s.id !== id);
  await AsyncStorage.setItem(SHADES_KEY, JSON.stringify(updated));
  return updated;
}

// ── Expiry helpers ────────────────────────────────────────────────────────────

function daysOpen(openedAt: string): number {
  return Math.floor((Date.now() - new Date(openedAt).getTime()) / 86400000);
}

function daysUntilExpiry(expiryDate: string): number {
  return Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000);
}

function paoStatus(
  label: string,
  openedAt: string,
  paoMonths?: number
): { status: 'ok' | 'soon' | 'expired'; daysLeft: number } {
  const months = paoMonths ?? DEFAULT_PAO[label.toLowerCase()] ?? 12;
  const limitDays = months * 30;
  const used = daysOpen(openedAt);
  const daysLeft = limitDays - used;
  if (daysLeft <= 0) return { status: 'expired', daysLeft: 0 };
  if (daysLeft <= 30) return { status: 'soon', daysLeft };
  return { status: 'ok', daysLeft };
}

function parseExpiryInput(input: string): string | null {
  // Accept MM/YYYY or MM/YY
  const match = input.match(/^(\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return null;
  const month = parseInt(match[1]) - 1;
  const year = match[2].length === 2 ? 2000 + parseInt(match[2]) : parseInt(match[2]);
  const date = new Date(year, month, 1);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StarRating({
  value,
  onChange,
}: {
  value?: number;
  onChange: (n: number) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, marginTop: 5 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => onChange(n)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Ionicons
            name={n <= (value ?? 0) ? 'star' : 'star-outline'}
            size={15}
            color={n <= (value ?? 0) ? '#F9C74F' : '#ccc'}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ExpiryIndicator({
  product,
  onMarkOpened,
}: {
  product: SavedProduct;
  onMarkOpened: () => void;
}) {
  const lines: React.ReactNode[] = [];

  // Printed expiry
  if (product.expiryDate) {
    const days = daysUntilExpiry(product.expiryDate);
    const expired = days <= 0;
    const soon = days > 0 && days <= 60;
    lines.push(
      <View key="printed" style={styles.expiryRow}>
        <Ionicons
          name="calendar"
          size={12}
          color={expired ? '#C62828' : soon ? '#E65100' : '#2E7D32'}
        />
        <Text
          style={[
            styles.expiryText,
            expired && { color: '#C62828' },
            soon && { color: '#E65100' },
          ]}
        >
          {expired
            ? `Expired ${Math.abs(days)} days ago`
            : soon
            ? `Expires in ${days} days`
            : `Expires ${new Date(product.expiryDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
        </Text>
      </View>
    );
  }

  // PAO countdown
  if (product.openedAt) {
    const { status, daysLeft } = paoStatus(product.label, product.openedAt, product.paoMonths);
    const paoMonths = product.paoMonths ?? DEFAULT_PAO[product.label.toLowerCase()] ?? 12;
    lines.push(
      <View key="pao" style={styles.expiryRow}>
        <Ionicons
          name="time-outline"
          size={12}
          color={status === 'expired' ? '#C62828' : status === 'soon' ? '#E65100' : '#2E7D32'}
        />
        <Text
          style={[
            styles.expiryText,
            status === 'expired' && { color: '#C62828' },
            status === 'soon' && { color: '#E65100' },
          ]}
        >
          {status === 'expired'
            ? `Past ${paoMonths}M use-by period`
            : status === 'soon'
            ? `Replace in ${daysLeft} days (${paoMonths}M period)`
            : `${daysLeft} days left of ${paoMonths}M period`}
        </Text>
      </View>
    );
  } else {
    lines.push(
      <TouchableOpacity key="open" style={styles.openButton} onPress={onMarkOpened}>
        <Ionicons name="calendar-outline" size={12} color={PINK} />
        <Text style={styles.openButtonText}>Mark as opened</Text>
      </TouchableOpacity>
    );
  }

  return <>{lines}</>;
}

// ── Add / Edit product modal ──────────────────────────────────────────────────

function AddProductModal({
  visible,
  onClose,
  onSave,
  initialValues,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (p: Partial<SavedProduct>) => void;
  initialValues?: Partial<SavedProduct>;
}) {
  const isEdit = !!initialValues?.id;

  const formatExpiryForDisplay = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  const [brand, setBrand] = useState(initialValues?.brand ?? '');
  const [name, setName] = useState(initialValues?.productName ?? '');
  const [shade, setShade] = useState(initialValues?.shade ?? '');
  const [label, setLabel] = useState(initialValues?.label ?? '');
  const [expiry, setExpiry] = useState(formatExpiryForDisplay(initialValues?.expiryDate));
  const [rating, setRating] = useState(initialValues?.rating);
  const [notes, setNotes] = useState(initialValues?.notes ?? '');
  const [expiryError, setExpiryError] = useState('');

  // Reset fields when modal opens with new values
  React.useEffect(() => {
    if (visible) {
      setBrand(initialValues?.brand ?? '');
      setName(initialValues?.productName ?? '');
      setShade(initialValues?.shade ?? '');
      setLabel(initialValues?.label ?? '');
      setExpiry(formatExpiryForDisplay(initialValues?.expiryDate));
      setRating(initialValues?.rating);
      setNotes(initialValues?.notes ?? '');
      setExpiryError('');
    }
  }, [visible, initialValues]);

  const handleSave = () => {
    if (!name.trim() && !brand.trim()) {
      Alert.alert('Add a product name or brand');
      return;
    }
    let expiryDate: string | undefined;
    if (expiry.trim()) {
      const parsed = parseExpiryInput(expiry.trim());
      if (!parsed) {
        setExpiryError('Use format MM/YYYY e.g. 06/2027');
        return;
      }
      expiryDate = parsed;
    }
    setExpiryError('');
    onSave({
      id: initialValues?.id,
      brand: brand.trim() || undefined,
      productName: name.trim() || undefined,
      shade: shade.trim() || undefined,
      label: label.trim() || 'product',
      displayName: name.trim() || brand.trim(),
      confidence: initialValues?.confidence ?? 1,
      expiryDate,
      rating,
      notes: notes.trim() || undefined,
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: PAGE_BG }}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{isEdit ? 'Edit product' : 'Add product'}</Text>
          <TouchableOpacity onPress={onClose}>
            <Ionicons name="close" size={24} color={TEXT} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ padding: 20 }}>
          {[
            { label: 'Brand', value: brand, set: setBrand, placeholder: 'e.g. MAC, NARS, Fenty Beauty' },
            { label: 'Product name', value: name, set: setName, placeholder: 'e.g. Studio Fix Fluid SPF 15' },
            { label: 'Shade', value: shade, set: setShade, placeholder: 'e.g. NW45, 220, Caramel' },
            { label: 'Category', value: label, set: setLabel, placeholder: 'e.g. foundation, mascara, blush' },
          ].map((field) => (
            <View key={field.label} style={{ marginBottom: 16 }}>
              <Text style={styles.inputLabel}>{field.label}</Text>
              <TextInput
                style={styles.input}
                value={field.value}
                onChangeText={field.set}
                placeholder={field.placeholder}
                placeholderTextColor="#C4A8B3"
              />
            </View>
          ))}

          {/* Rating */}
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.inputLabel}>Rating</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity
                  key={n}
                  onPress={() => setRating(n === rating ? undefined : n)}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <Ionicons
                    name={n <= (rating ?? 0) ? 'star' : 'star-outline'}
                    size={24}
                    color={n <= (rating ?? 0) ? '#F9C74F' : '#ccc'}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.inputLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="e.g. Great for summer, good coverage..."
              placeholderTextColor="#C4A8B3"
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Expiry date */}
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.inputLabel}>Expiry date (from packaging)</Text>
            <TextInput
              style={[styles.input, expiryError ? { borderColor: '#C62828' } : {}]}
              value={expiry}
              onChangeText={(t) => { setExpiry(t); setExpiryError(''); }}
              placeholder="MM/YYYY  e.g. 06/2027"
              placeholderTextColor="#C4A8B3"
              keyboardType="numbers-and-punctuation"
            />
            {expiryError ? (
              <Text style={{ color: '#C62828', fontSize: 12, marginTop: 4 }}>{expiryError}</Text>
            ) : (
              <Text style={styles.inputHint}>
                Check the bottom or back of the packaging for a date or hourglass symbol
              </Text>
            )}
          </View>

          <View style={styles.paoNote}>
            <Ionicons name="information-circle-outline" size={16} color={PINK} />
            <Text style={styles.paoNoteText}>
              Once you mark the product as opened, BeautyLens will also track the
              recommended use-by period (e.g. 3 months for mascara, 12 months for foundation)
              and remind you when its time to replace it.
            </Text>
          </View>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>{isEdit ? 'Save changes' : 'Add to collection'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

type TabKey = 'products' | 'shades';

export default function CollectionScreen() {
  const [products, setProducts] = useState<SavedProduct[]>([]);
  const [shades, setShades] = useState<SavedShade[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('products');
  const [showAdd, setShowAdd] = useState(false);
  const [editTarget, setEditTarget] = useState<SavedProduct | null>(null);
  const [matchTarget, setMatchTarget] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadCollection(), loadSavedShades()]).then(([p, s]) => {
        setProducts(p);
        setShades(s);
        setLoading(false);
      });
    }, [])
  );

  // Check for expiring products on tab focus and show a banner
  useEffect(() => {
    if (!products.length) return;
    const expiring = products.filter((p) => {
      if (p.expiryDate && daysUntilExpiry(p.expiryDate) <= 30) return true;
      if (p.openedAt) {
        const { status } = paoStatus(p.label, p.openedAt, p.paoMonths);
        return status !== 'ok';
      }
      return false;
    });
    if (expiring.length > 0) {
      Alert.alert(
        '💄 Products expiring soon',
        `${expiring.length} product${expiring.length > 1 ? 's' : ''} in your collection ${expiring.length > 1 ? 'are' : 'is'} expiring or past the recommended use-by period.`,
        [{ text: 'Got it' }]
      );
    }
  }, [products]);

  const handleMarkOpened = async (id: string, label: string, displayName: string) => {
    const openedAt = new Date().toISOString();
    const paoMonths = DEFAULT_PAO[label.toLowerCase()] ?? 12;
    const paoLimitDays = paoMonths * 30;

    const updated = await updateProduct(id, {
      openedAt,
    });
    setProducts(updated);
  };

  const handleRate = async (id: string, rating: number) => {
    const updated = await updateProduct(id, { rating });
    setProducts(updated);
  };

  const handleMatchFeedback = async (id: string, feedback: 'great' | 'ok' | 'poor') => {
    const updated = await updateProduct(id, { matchFeedback: feedback });
    setProducts(updated);
    setMatchTarget(null);
  };

  const handleRemoveProduct = (id: string, name: string) => {
    Alert.alert('Remove product', `Remove ${name} from your collection?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const updated = await removeProduct(id);
          setProducts(updated);
        },
      },
    ]);
  };

  const handleManualAdd = async (p: Partial<SavedProduct>) => {
    await saveProductToCollection({
      id: `manual-${Date.now()}`,
      brand: p.brand,
      productName: p.productName,
      displayName: p.displayName || p.productName || 'Product',
      label: p.label || 'product',
      shade: p.shade,
      confidence: 1,
      expiryDate: p.expiryDate,
    });
    const updated = await loadCollection();
    setProducts(updated);
  };

  const handleSaveEdit = async (p: Partial<SavedProduct>) => {
    if (!p.id) return;
    const existing = products.find((prod) => prod.id === p.id);
    const updated = await updateProduct(p.id, {
      brand: p.brand,
      productName: p.productName,
      displayName: p.displayName || p.productName || existing?.displayName,
      label: p.label || existing?.label || 'product',
      shade: p.shade,
      expiryDate: p.expiryDate,
      rating: p.rating,
      notes: p.notes,
    });
    setProducts(updated);
    setEditTarget(null);
  };

  const handleRemoveShade = async (id: string) => {
    const updated = await removeShade(id);
    setShades(updated);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Text style={styles.screenTitle}>Collection</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.screenTitle}>Collection</Text>
        {tab === 'products' && (
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
            <Ionicons name="add" size={20} color={PINK} />
            <Text style={styles.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['products', 'shades'] as TabKey[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tabBtn, tab === t && styles.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'products'
                ? `Products${products.length ? ` (${products.length})` : ''}`
                : `Saved shades${shades.length ? ` (${shades.length})` : ''}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Products tab ── */}
        {tab === 'products' && (
          products.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="bag-handle-outline" size={38} color={PINK} />
              </View>
              <Text style={styles.emptyTitle}>Your makeup bag is empty</Text>
              <Text style={styles.emptyBody}>
                Scan a product and tap &quot;Save to Collection&quot;, or tap Add to add manually.
              </Text>
            </View>
          ) : (
            <View style={styles.group}>
              {products.map((product, i) => {
                const displayName = product.brand
                  ? `${product.brand} ${product.productName || product.displayName}`
                  : product.productName || product.displayName;

                return (
                  <View
                    key={product.id}
                    style={[
                      styles.productRow,
                      i < products.length - 1 && styles.rowDivider,
                    ]}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons name="cube-outline" size={18} color={PINK} />
                    </View>

                    <View style={{ flex: 1 }}>
                      {product.brand && (
                        <View style={styles.brandBadge}>
                          <Text style={styles.brandBadgeText}>{product.brand}</Text>
                        </View>
                      )}

                      <Text style={styles.rowLabel} numberOfLines={2}>
                        {displayName}
                      </Text>

                      {product.shade && (
                        <Text style={styles.shadeText}>Shade: {product.shade}</Text>
                      )}

                      {/* Notes */}
                      {product.notes && (
                        <Text style={styles.notesText}>{product.notes}</Text>
                      )}

                      {/* Star rating */}
                      <StarRating
                        value={product.rating}
                        onChange={(n) => handleRate(product.id, n)}
                      />

                      {/* Match feedback */}
                      <TouchableOpacity
                        style={[
                          styles.matchBadge,
                          {
                            backgroundColor:
                              product.matchFeedback === 'great' ? '#E8F5E9'
                              : product.matchFeedback === 'ok' ? '#FFF3E0'
                              : product.matchFeedback === 'poor' ? '#FFEBEE'
                              : PINK_SOFT,
                          },
                        ]}
                        onPress={() => setMatchTarget(product.id)}
                      >
                        <Text
                          style={[
                            styles.matchBadgeText,
                            {
                              color:
                                product.matchFeedback === 'great' ? '#2E7D32'
                                : product.matchFeedback === 'ok' ? '#E65100'
                                : product.matchFeedback === 'poor' ? '#C62828'
                                : PINK,
                            },
                          ]}
                        >
                          {product.matchFeedback === 'great' ? '✅ Great match'
                            : product.matchFeedback === 'ok' ? '🟡 OK match'
                            : product.matchFeedback === 'poor' ? '❌ Poor match'
                            : 'Rate shade match'}
                        </Text>
                      </TouchableOpacity>

                      {/* Expiry indicators */}
                      <ExpiryIndicator
                        product={product}
                        onMarkOpened={() =>
                          handleMarkOpened(product.id, product.label, displayName)
                        }
                      />

                      <Text style={styles.savedDate}>
                        Saved{' '}
                        {new Date(product.savedAt).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                        })}
                      </Text>
                    </View>

                    <View style={{ gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => setEditTarget(product)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="pencil-outline" size={16} color="#aaa" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.removeButton}
                        onPress={() => handleRemoveProduct(product.id, displayName)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#ccc" />
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
          )
        )}

        {/* ── Shades tab ── */}
        {tab === 'shades' && (
          shades.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}>
                <Ionicons name="color-palette-outline" size={38} color={PINK} />
              </View>
              <Text style={styles.emptyTitle}>No saved shades yet</Text>
              <Text style={styles.emptyBody}>
                Run a Shade Match and save the shades you like, they&apos;ll appear here.
              </Text>
            </View>
          ) : (
            <View style={styles.group}>
              {shades.map((shade, i) => (
                <View
                  key={shade.id}
                  style={[styles.productRow, i < shades.length - 1 && styles.rowDivider]}
                >
                  {shade.hexColor ? (
                    <View style={[styles.colorSwatch, { backgroundColor: shade.hexColor }]} />
                  ) : (
                    <View style={styles.rowIcon}>
                      <Ionicons name="bookmark" size={18} color={PINK} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={styles.brandBadge}>
                      <Text style={styles.brandBadgeText}>{shade.brand}</Text>
                    </View>
                    <Text style={styles.rowLabel}>{shade.productName}</Text>
                    <Text style={styles.shadeText}>{shade.shade}</Text>
                    {shade.undertone && (
                      <Text style={styles.savedDate}>Undertone: {shade.undertone}</Text>
                    )}
                    <Text style={styles.savedDate}>
                      Saved{' '}
                      {new Date(shade.savedAt).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => handleRemoveShade(shade.id)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="trash-outline" size={16} color="#ccc" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )
        )}
      </ScrollView>

      {/* Match feedback modal */}
      <Modal
        visible={matchTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMatchTarget(null)}
      >
        <Pressable style={styles.overlay} onPress={() => setMatchTarget(null)}>
          <View style={styles.matchModal}>
            <Text style={styles.matchModalTitle}>How was the shade match?</Text>
            {(['great', 'ok', 'poor'] as const).map((fb) => (
              <TouchableOpacity
                key={fb}
                style={styles.matchOption}
                onPress={() => matchTarget && handleMatchFeedback(matchTarget, fb)}
              >
                <Text style={styles.matchOptionText}>
                  {fb === 'great' ? '✅  Great match'
                    : fb === 'ok' ? '🟡  OK match'
                    : '❌  Poor match'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Manual add modal */}
      <AddProductModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onSave={handleManualAdd}
      />

      {/* Edit modal */}
      <AddProductModal
        visible={editTarget !== null}
        onClose={() => setEditTarget(null)}
        onSave={handleSaveEdit}
        initialValues={editTarget ?? undefined}
      />
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { paddingHorizontal: 14, paddingBottom: 40 },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18, marginTop: 10, marginBottom: 4,
  },
  screenTitle: { fontFamily: SERIF, fontSize: 28, fontWeight: '700', color: TEXT },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: PINK_SOFT, paddingHorizontal: 12,
    paddingVertical: 6, borderRadius: 20,
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: PINK },
  tabs: {
    flexDirection: 'row', marginHorizontal: 14, marginBottom: 14,
    backgroundColor: '#F0E6EC', borderRadius: 12, padding: 3,
  },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#B9718F', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12, shadowRadius: 4, elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: '600', color: MUTED },
  tabTextActive: { color: PINK },
  emptyCard: {
    backgroundColor: '#fff', borderRadius: 20,
    paddingVertical: 34, paddingHorizontal: 24, alignItems: 'center',
    shadowColor: '#B9718F', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  emptyIcon: {
    width: 76, height: 76, borderRadius: 38,
    backgroundColor: PINK_SOFT,
    justifyContent: 'center', alignItems: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: TEXT, marginBottom: 6 },
  emptyBody: { fontSize: 14, color: MUTED, textAlign: 'center', lineHeight: 20 },
  group: {
    backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden',
    shadowColor: '#B9718F', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 10, elevation: 2,
  },
  productRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 12, paddingHorizontal: 16, paddingVertical: 14,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: '#F1E4EA' },
  rowIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: PINK_SOFT,
    justifyContent: 'center', alignItems: 'center', flexShrink: 0,
  },
  colorSwatch: {
    width: 36, height: 36, borderRadius: 18,
    flexShrink: 0, borderWidth: 1, borderColor: '#eee',
  },
  rowLabel: { fontSize: 15, fontWeight: '700', color: TEXT },
  brandBadge: {
    alignSelf: 'flex-start', backgroundColor: PINK_SOFT,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 8, marginBottom: 4,
  },
  brandBadgeText: {
    fontSize: 10, fontWeight: '700', color: PINK,
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  shadeText: { fontSize: 12, color: PINK, fontWeight: '600', marginTop: 2 },
  savedDate: { fontSize: 11.5, color: MUTED, marginTop: 4 },
  expiryRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 5 },
  expiryText: { fontSize: 12, color: '#2E7D32', fontWeight: '500' },
  openButton: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 5, alignSelf: 'flex-start',
  },
  openButtonText: { fontSize: 12, color: PINK, fontWeight: '500' },
  removeButton: { padding: 4, marginTop: 2 },
  matchBadge: {
    alignSelf: 'flex-start', paddingHorizontal: 8,
    paddingVertical: 3, borderRadius: 8, marginTop: 5,
  },
  matchBadgeText: { fontSize: 11, fontWeight: '600' },
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center', alignItems: 'center',
  },
  matchModal: {
    backgroundColor: '#fff', borderRadius: 20,
    padding: 24, width: '80%', gap: 12,
  },
  matchModalTitle: {
    fontSize: 17, fontWeight: '700', color: TEXT,
    textAlign: 'center', marginBottom: 4,
  },
  matchOption: {
    paddingVertical: 12, paddingHorizontal: 16,
    backgroundColor: PAGE_BG, borderRadius: 12,
  },
  matchOptionText: { fontSize: 15, fontWeight: '600', color: TEXT },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#F1E4EA',
  },
  modalTitle: { fontFamily: SERIF, fontSize: 22, fontWeight: '700', color: TEXT },
  inputLabel: { fontSize: 13, fontWeight: '600', color: MUTED, marginBottom: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: TEXT, borderWidth: 1, borderColor: '#F1E4EA',
  },
  inputHint: { fontSize: 11.5, color: MUTED, marginTop: 4, lineHeight: 16 },
  paoNote: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: PINK_SOFT, borderRadius: 12,
    padding: 12, marginBottom: 20,
  },
  paoNoteText: { flex: 1, fontSize: 12.5, color: PINK, lineHeight: 18 },
  saveBtn: {
    backgroundColor: PINK, paddingVertical: 16,
    borderRadius: 14, alignItems: 'center', marginTop: 8,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  notesText: {
    fontSize: 12,
    color: MUTED,
    marginTop: 3,
    lineHeight: 17,
    fontStyle: 'italic',
  },
});
