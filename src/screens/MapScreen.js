import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Share,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import Slider from '@react-native-community/slider';
import * as Clipboard from 'expo-clipboard';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BootScreen from '../components/BootScreen';
import CountMarker from '../components/CountMarker';
import PinMarker from '../components/PinMarker';
import ThemeSwitch from '../components/ThemeSwitch';
import { groupPins, zoomRegion } from '../cluster';
import { createPin, createReply, deletePin, fetchPins, fetchReplies, reportPin } from '../api';
import { deviceId } from '../device';
import { boxForRadius, formatDistance, kmBetween } from '../distance';
import { notifyLocal } from '../notify';
import { API_URL } from '../config';
import { lookupIpCity } from '../ipCity';
import { shrinkPhoto } from '../photo';
import { timeAgo, timeLeft } from '../time';
import { useTheme } from '../theme';

const SOFIA = {
  latitude: 42.6977,
  longitude: 23.3219,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

const DURATIONS = [
  { id: '5m', label: '5 мин' },
  { id: '1h', label: '1 час' },
  { id: '24h', label: '24 часа' },
];

const CATEGORIES = [
  { id: 'seeking', label: 'Търся' },
  { id: 'lost', label: 'Загубено' },
  { id: 'warning', label: 'Внимание' },
  { id: 'free', label: 'Безплатно' },
  { id: 'other', label: 'Друго' },
];

const CITIES = [
  { name: 'София', find: 'sofia sofiq', latitude: 42.6977, longitude: 23.3219 },
  { name: 'Пловдив', find: 'plovdiv', latitude: 42.1354, longitude: 24.7453 },
  { name: 'Варна', find: 'varna', latitude: 43.2141, longitude: 27.9147 },
  { name: 'Бургас', find: 'burgas', latitude: 42.5048, longitude: 27.4626 },
  { name: 'Стара Загора', find: 'stara zagora', latitude: 42.4258, longitude: 25.6345 },
  { name: 'Русе', find: 'ruse', latitude: 43.8356, longitude: 25.9657 },
  { name: 'Плевен', latitude: 43.417, longitude: 24.6067 },
  { name: 'Сливен', latitude: 42.6816, longitude: 26.3292 },
  { name: 'Добрич', latitude: 43.5726, longitude: 27.8273 },
  { name: 'Шумен', latitude: 43.2712, longitude: 26.9361 },
  { name: 'Перник', latitude: 42.6052, longitude: 23.0378 },
  { name: 'Хасково', latitude: 41.9344, longitude: 25.5554 },
  { name: 'Ямбол', latitude: 42.4842, longitude: 26.5035 },
  { name: 'Пазарджик', latitude: 42.1928, longitude: 24.3336 },
  { name: 'Благоевград', latitude: 42.0119, longitude: 23.09 },
  { name: 'Велико Търново', latitude: 43.0757, longitude: 25.6172 },
  { name: 'Враца', latitude: 43.2102, longitude: 23.5529 },
  { name: 'Габрово', latitude: 42.8742, longitude: 25.3187 },
  { name: 'Видин', latitude: 43.9916, longitude: 22.8824 },
  { name: 'Монтана', latitude: 43.4125, longitude: 23.225 },
  { name: 'Ловеч', latitude: 43.137, longitude: 24.7142 },
  { name: 'Кърджали', latitude: 41.6338, longitude: 25.3777 },
  { name: 'Кюстендил', latitude: 42.2839, longitude: 22.6911 },
  { name: 'Разград', latitude: 43.5332, longitude: 26.5242 },
  { name: 'Силистра', latitude: 44.1147, longitude: 27.2672 },
  { name: 'Търговище', latitude: 43.2494, longitude: 26.5727 },
  { name: 'Смолян', latitude: 41.5774, longitude: 24.7129 },
  { name: 'Казанлък', latitude: 42.6194, longitude: 25.393 },
];

const FEATURED_CITIES = ['София', 'Пловдив', 'Варна', 'Бургас', 'Стара Загора'];

function categoryLabel(id) {
  return CATEGORIES.find((item) => item.id === id)?.label || '';
}

const LIGHT_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const DARK_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';

function MeMarker({ coordinate }) {
  const { colors } = useTheme();
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 400);
    return () => clearTimeout(timer);
  }, [colors]);

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking} zIndex={10000}>
      <View
        collapsable={false}
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: colors.me,
          borderWidth: 3,
          borderColor: colors.meBorder,
        }}
      />
    </Marker>
  );
}

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const { dark, colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const mapRef = useRef(null);
  const regionRef = useRef(SOFIA);
  const [region, setRegion] = useState(SOFIA);
  const [bootRegion, setBootRegion] = useState(null);
  const userMoved = useRef(false);
  const bootSet = useRef(false);
  const deviceRef = useRef(null);
  const requestRef = useRef(0);
  const loadTimer = useRef(null);
  const [pins, setPins] = useState([]);
  const [finding, setFinding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [composer, setComposer] = useState(null);
  const [selected, setSelected] = useState(null);
  const [message, setMessage] = useState('');
  const [image, setImage] = useState(null);
  const [duration, setDuration] = useState('1h');
  const [category, setCategory] = useState('other');
  const [listCategory, setListCategory] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [replies, setReplies] = useState([]);
  const [replyError, setReplyError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [authorOnly, setAuthorOnly] = useState(false);
  const [me, setMe] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [citiesOpen, setCitiesOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState(5);
  const [nearby, setNearby] = useState([]);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState('');
  const listCenter = useRef(null);
  const nearbyRequest = useRef(0);
  const watchArmed = useRef(false);
  const seenIds = useRef(new Set());
  const [notice, setNotice] = useState(null);
  const [copiedPinId, setCopiedPinId] = useState(null);

  const load = useCallback(async (nextRegion) => {
    const requestId = ++requestRef.current;
    try {
      const device = deviceRef.current || await deviceId();
      deviceRef.current = device;
      const rows = await fetchPins(nextRegion, device);
      if (requestId !== requestRef.current) {
        return;
      }
      setPins(rows.filter((pin) => new Date(pin.expires_at).getTime() > Date.now()));
      setError('');
    } catch {
      if (requestId === requestRef.current) {
        setError('Картата не успя да зареди пиновете.');
      }
    }
  }, []);

  useEffect(() => {
    const refresh = setInterval(() => load(regionRef.current), 20000);
    const clock = setInterval(() => {
      const tick = Date.now();
      setNow(tick);
      setPins((current) => current.filter((pin) => new Date(pin.expires_at).getTime() > tick));
      setSelected((current) => (
        current && new Date(current.expires_at).getTime() > tick ? current : null
      ));
    }, 30000);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
      clearTimeout(loadTimer.current);
    };
  }, [load]);

  useEffect(() => {
    let stopped = false;

    async function watchNear() {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (permission.status !== 'granted' || stopped) {
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (stopped) {
          return;
        }
        const device = deviceRef.current || await deviceId();
        deviceRef.current = device;
        const here = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        const rows = await fetchPins(boxForRadius(here.latitude, here.longitude, 2), device);
        if (stopped) {
          return;
        }
        const near = rows.filter((pin) => (
          kmBetween(here.latitude, here.longitude, pin.latitude, pin.longitude) <= 2.05
        ));
        if (!watchArmed.current) {
          near.forEach((pin) => seenIds.current.add(pin.id));
          watchArmed.current = true;
          return;
        }
        const tick = Date.now();
        const fresh = near
          .filter((pin) => {
            if (pin.mine || seenIds.current.has(pin.id)) {
              return false;
            }
            const created = new Date(pin.created_at).getTime();
            return Number.isFinite(created) && tick - created <= 45000;
          })
          .sort((a, b) => (
            kmBetween(here.latitude, here.longitude, a.latitude, a.longitude)
            - kmBetween(here.latitude, here.longitude, b.latitude, b.longitude)
          ));
        fresh.forEach((pin) => seenIds.current.add(pin.id));
        if (!fresh.length) {
          return;
        }
        const first = fresh[0];
        const extra = fresh.length - 1;
        const body = extra > 0 ? `${first.message} и още ${extra}` : first.message;
        setNotice({ body, pin: first });
        notifyLocal('Нов пин наблизо', body);
      } catch {
        // The next poll tries again. A missing location permission stays quiet.
      }
    }

    const timer = setInterval(watchNear, 20000);
    watchNear();
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timer = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(timer);
  }, [notice]);

  function scheduleLoad(next) {
    regionRef.current = next;
    setRegion(next);
    clearTimeout(loadTimer.current);
    loadTimer.current = setTimeout(() => load(next), 400);
  }

  async function readLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Местоположението е изключено',
        'Kostaa има нужда от местоположението ти, за да пусне пин там, където стоиш.',
        [
          { text: 'Не сега', style: 'cancel' },
          { text: 'Отвори настройките', onPress: () => Linking.openSettings() },
        ],
      );
      return null;
    }

    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  function moveTo(next) {
    regionRef.current = next;
    setRegion(next);
    mapRef.current?.animateToRegion(next, 400);
  }

  const mapItems = useMemo(() => groupPins(pins, region), [pins, region]);

  async function loadNearby(kilometers, center) {
    const origin = center || listCenter.current;
    if (!origin) {
      return;
    }

    const requestId = ++nearbyRequest.current;
    setNearbyLoading(true);
    try {
      const device = deviceRef.current || await deviceId();
      deviceRef.current = device;
      const rows = await fetchPins(boxForRadius(origin.latitude, origin.longitude, kilometers), device);
      if (requestId !== nearbyRequest.current) {
        return;
      }
      setNearby(rows
        .map((pin) => ({
          ...pin,
          km: kmBetween(origin.latitude, origin.longitude, pin.latitude, pin.longitude),
        }))
        .filter((pin) => pin.km <= kilometers + 0.05)
        .sort((a, b) => a.km - b.km));
      setNearbyError('');
    } catch {
      if (requestId === nearbyRequest.current) {
        setNearbyError('Списъкът не се зареди.');
      }
    } finally {
      if (requestId === nearbyRequest.current) {
        setNearbyLoading(false);
      }
    }
  }

  function openList() {
    const center = {
      latitude: regionRef.current.latitude,
      longitude: regionRef.current.longitude,
    };
    listCenter.current = center;
    setListOpen(true);
    loadNearby(radiusKm, center);
  }

  function pinLink(pin) {
    return `${API_URL}/map?pin=${pin.id}`;
  }

  async function copyPinLink(pin) {
    try {
      await Clipboard.setStringAsync(pinLink(pin));
      setCopiedPinId(pin.id);
      setTimeout(() => {
        setCopiedPinId((current) => (current === pin.id ? null : current));
      }, 1600);
    } catch {
      Alert.alert('Връзката не се копира', pinLink(pin));
    }
  }

  async function sharePin(pin) {
    const url = pinLink(pin);
    try {
      await Share.share({
        title: pin.message,
        message: `${pin.message}\n${url}`,
        url,
      });
    } catch {
      // Closing the share sheet is not a failure.
    }
  }

  function focusPin(pin) {
    const current = regionRef.current;
    setListOpen(false);
    moveTo({
      latitude: pin.latitude,
      longitude: pin.longitude,
      latitudeDelta: current.latitudeDelta,
      longitudeDelta: current.longitudeDelta,
    });
  }

  async function pinHere() {
    setFinding(true);
    setError('');
    try {
      const next = await readLocation();
      if (!next) {
        return;
      }
      moveTo(next);
      setMessage('');
      setImage(null);
      setDuration('1h');
      setCategory('other');
      setSelected(null);
      setComposer({ latitude: next.latitude, longitude: next.longitude });
    } catch {
      Alert.alert('Местоположението липсва', 'Kostaa не успя да прочете къде стоиш.');
    } finally {
      setFinding(false);
    }
  }

  async function recenter() {
    try {
      const next = await readLocation();
      if (next) {
        moveTo(next);
      }
    } catch {
      Alert.alert('Местоположението липсва', 'Kostaa не успя да прочете къде стоиш.');
    }
  }

  async function choosePhoto(fromCamera) {
    if (fromCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Камерата е изключена', 'Можеш да избереш снимка от галерията или да позволиш камерата в настройките.', [
          { text: 'Не сега', style: 'cancel' },
          { text: 'Отвори настройките', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

    if (!result.canceled && result.assets[0]) {
      try {
        setImage(await shrinkPhoto(result.assets[0]));
      } catch {
        Alert.alert('Снимката не е готова', 'Kostaa не успя да подготви тази снимка. Опитай с друга.');
      }
    }
  }

  async function dropPin() {
    const text = message.trim();
    if (!text || !composer) {
      return;
    }

    setSaving(true);
    try {
      const device = deviceRef.current || await deviceId();
      deviceRef.current = device;
      const pin = await createPin({
        message: text,
        latitude: composer.latitude,
        longitude: composer.longitude,
        duration,
        category,
        image,
        device,
      });
      setPins((current) => [pin, ...current.filter((item) => item.id !== pin.id)]);
      setComposer(null);
      setError('');
    } catch (err) {
      Alert.alert('Пинът не е запазен', err.message || 'Опитай пак.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    let watch;

    function showCity(latitude, longitude) {
      if (cancelled || userMoved.current) {
        return;
      }
      if (bootSet.current) {
        const km = kmBetween(
          regionRef.current.latitude,
          regionRef.current.longitude,
          latitude,
          longitude,
        );
        if (km <= 1) {
          return;
        }
      }
      const next = {
        latitude,
        longitude,
        latitudeDelta: 0.08,
        longitudeDelta: 0.08,
      };
      regionRef.current = next;
      setRegion(next);
      if (!bootSet.current || !mapRef.current) {
        bootSet.current = true;
        setBootRegion(next);
      } else {
        mapRef.current.animateToRegion(next, 500);
      }
      load(next);
    }

    function applyPosition(position) {
      if (cancelled || !position?.coords) {
        return;
      }
      setMe({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
      showCity(position.coords.latitude, position.coords.longitude);
    }

    (async () => {
      const ipTask = lookupIpCity();
      let status = 'undetermined';
      try {
        status = (await Location.getForegroundPermissionsAsync()).status;
      } catch {
        status = 'denied';
      }

      const permissionTask = status === 'granted'
        ? Promise.resolve('granted')
        : Location.requestForegroundPermissionsAsync()
          .then((result) => result.status)
          .catch(() => 'denied');

      const gpsTask = status === 'granted'
        ? Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
          .then((position) => {
            applyPosition(position);
            return position;
          })
          .catch(() => null)
        : null;

      if (gpsTask) {
        await Promise.race([
          gpsTask,
          new Promise((resolve) => setTimeout(resolve, 1200)),
        ]);
      }

      if (!bootSet.current && !cancelled) {
        const ip = await Promise.race([
          ipTask,
          new Promise((resolve) => setTimeout(() => resolve(null), 1600)),
        ]);
        if (!bootSet.current && !cancelled) {
          const lateIp = ip || await ipTask;
          if (!bootSet.current && !cancelled) {
            showCity(
              lateIp?.latitude || SOFIA.latitude,
              lateIp?.longitude || SOFIA.longitude,
            );
          }
        }
      }

      if (cancelled) {
        return;
      }

      if (status !== 'granted') {
        try {
          status = await permissionTask;
          if (status === 'granted') {
            applyPosition(await Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.High,
            }));
          }
        } catch {
          status = 'denied';
        }
      }

      if (cancelled || status !== 'granted') {
        return;
      }

      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 25 },
        (position) => applyPosition(position),
      );
      if (cancelled) {
        watch.remove();
      }
    })();

    return () => {
      cancelled = true;
      watch?.remove();
    };
  }, [load]);

  useEffect(() => {
    setReplyText('');
    setAuthorOnly(false);

    if (!selected) {
      setReplies([]);
      setReplyError('');
      return undefined;
    }

    let cancelled = false;
    setReplyError('');

    (async () => {
      try {
        const device = deviceRef.current || await deviceId();
        deviceRef.current = device;
        const rows = await fetchReplies(selected.id, device);
        if (!cancelled) {
          setReplies(rows);
        }
      } catch {
        if (!cancelled) {
          setReplyError('Отговорите не се заредиха.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected?.id]);

  function markPin(pinId, patch) {
    setPins((current) => current.map((item) => (item.id === pinId ? { ...item, ...patch } : item)));
    setSelected((current) => (current && current.id === pinId ? { ...current, ...patch } : current));
  }

  async function sendReply() {
    const text = replyText.trim();
    if (!text || !selected || sendingReply) {
      return;
    }

    setSendingReply(true);
    try {
      const device = deviceRef.current || await deviceId();
      deviceRef.current = device;
      const created = await createReply(selected.id, text, device, authorOnly);
      setReplyText('');
      setAuthorOnly(false);
      setReplies((current) => [...current.filter((item) => item.id !== created.id), { ...created, mine: true }]);
      markPin(selected.id, { replied: true });
    } catch (err) {
      Alert.alert('Отговорът не е изпратен', err.message || 'Опитай пак.');
    } finally {
      setSendingReply(false);
    }
  }

  function confirmReport(pin) {
    Alert.alert('Докладваш ли този пин?', 'Пет доклада от различни хора го махат.', [
      { text: 'Отказ', style: 'cancel' },
      { text: 'Докладвай', style: 'destructive', onPress: () => sendReport(pin) },
    ]);
  }

  async function sendReport(pin) {
    setReporting(true);
    try {
      const device = deviceRef.current || await deviceId();
      deviceRef.current = device;
      const result = await reportPin(pin.id, device);
      if (result.deleted) {
        setPins((current) => current.filter((item) => item.id !== pin.id));
        setSelected(null);
        return;
      }
      markPin(pin.id, { reported: true });
    } catch (err) {
      Alert.alert('Пинът не можа да бъде докладван', err.message || 'Опитай пак.');
    } finally {
      setReporting(false);
    }
  }

  function goToCity(city) {
    userMoved.current = true;
    const next = {
      latitude: city.latitude,
      longitude: city.longitude,
      latitudeDelta: 0.08,
      longitudeDelta: 0.08,
    };
    regionRef.current = next;
    setRegion(next);
    mapRef.current?.animateToRegion(next, 600);
    load(next);
  }

  async function removePin(pin) {
    try {
      const device = deviceRef.current || await deviceId();
      await deletePin(pin.id, device);
      setPins((current) => current.filter((item) => item.id !== pin.id));
      setSelected(null);
    } catch (err) {
      Alert.alert('Пинът не можа да бъде махнат', err.message || 'Опитай пак.');
    }
  }

  if (!bootRegion) {
    return <BootScreen />;
  }

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={styles.fill}
        mapType="none"
        initialRegion={bootRegion}
        onPanDrag={() => {
          userMoved.current = true;
        }}
        onRegionChangeComplete={scheduleLoad}
      >
        <UrlTile
          key={dark ? 'dark-tiles' : 'light-tiles'}
          urlTemplate={dark ? DARK_TILES : LIGHT_TILES}
          maximumZ={16}
          tileSize={256}
          zIndex={-1}
        />
        {mapItems.clusters.map((cluster) => (
          <CountMarker
            key={`count-${cluster.id}`}
            cluster={cluster}
            onPress={() => moveTo(zoomRegion(regionRef.current, cluster))}
          />
        ))}
        {mapItems.singles.map((pin) => (
          <PinMarker
            key={pin.id}
            pin={pin}
            stackOffset={pin.stackOffset}
            onPress={() => setSelected(pin)}
          />
        ))}
        {me ? <MeMarker coordinate={me} /> : null}
      </MapView>

      <Text style={[styles.credit, { top: insets.top + 10 }]}>Карта: Esri</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.cityRow, { top: insets.top + 40 }]}
        contentContainerStyle={styles.cityRowContent}
      >
        {FEATURED_CITIES.map((name) => CITIES.find((city) => city.name === name)).map((city) => (
          <Pressable key={city.name} style={styles.cityPill} onPress={() => goToCity(city)}>
            <Text style={styles.cityPillText}>{city.name}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.cityPill, styles.cityMore]}
          onPress={() => {
            setCityQuery('');
            setCitiesOpen(true);
          }}
        >
          <Text style={styles.cityMoreText}>Още</Text>
        </Pressable>
      </ScrollView>

      {notice ? (
        <Pressable
          style={[styles.notice, { top: insets.top + 92 }]}
          onPress={() => {
            focusPin(notice.pin);
            setNotice(null);
          }}
        >
          <Text style={styles.noticeTitle}>Нов пин наблизо</Text>
          <Text style={styles.noticeBody}>{notice.body}</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Pressable style={[styles.banner, { top: insets.top + (notice ? 174 : 92) }]} onPress={() => load(regionRef.current)}>
          <Text style={styles.bannerText}>{error} Натисни, за да опиташ пак.</Text>
        </Pressable>
      ) : pins.length === 0 && !notice ? (
        <View style={[styles.hint, { top: insets.top + 92 }]} pointerEvents="none">
          <Text style={styles.hintText}>Още няма нищо наблизо. „Пин тук“ пуска бележка на това място.</Text>
        </View>
      ) : null}

      <View style={[styles.themePill, { bottom: insets.bottom + 74 }]}>
        <ThemeSwitch compact />
      </View>

      <Pressable
        style={[styles.locate, { bottom: insets.bottom + 16 }]}
        onPress={recenter}
        accessibilityLabel="Центрирай на моето място"
      >
        <View style={styles.locateRing} />
      </Pressable>

      <Pressable
        style={[styles.listButton, { bottom: insets.bottom + 74 }]}
        onPress={openList}
        accessibilityLabel="Пинове наблизо"
      >
        <View style={styles.listIcon}>
          <View style={styles.listBar} />
          <View style={styles.listBar} />
          <View style={styles.listBar} />
        </View>
      </Pressable>

      <Pressable
        style={[styles.pinButton, { bottom: insets.bottom + 16 }]}
        onPress={pinHere}
        disabled={finding}
      >
        {finding ? <ActivityIndicator color={colors.onButton} /> : <Text style={styles.pinButtonText}>Пин тук</Text>}
      </Pressable>

      <Modal visible={citiesOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setCitiesOpen(false)}>
        <View style={[styles.listScreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.listHeader}>
            <Text style={styles.sheetTitle}>Градове</Text>
            <Pressable onPress={() => setCitiesOpen(false)} hitSlop={8}>
              <Text style={styles.photoButtonText}>Затвори</Text>
            </Pressable>
          </View>
          <ThemeSwitch />
          <TextInput
            value={cityQuery}
            onChangeText={setCityQuery}
            placeholder="Търси град"
            placeholderTextColor={colors.faint}
            keyboardAppearance={dark ? 'dark' : 'light'}
            autoCorrect={false}
            style={styles.citySearch}
          />
          <FlatList
            data={CITIES.filter((city) => {
              const needle = cityQuery.trim().toLowerCase();
              if (!needle) {
                return true;
              }
              return city.name.toLowerCase().includes(needle) || (city.find || '').includes(needle);
            })}
            keyExtractor={(item) => item.name}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={styles.optional}>Няма такъв град.</Text>}
            renderItem={({ item }) => (
              <Pressable
                style={styles.cityChoice}
                onPress={() => {
                  setCitiesOpen(false);
                  goToCity(item);
                }}
              >
                <Text style={styles.cityChoiceText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <Modal visible={listOpen} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setListOpen(false)}>
        <View style={[styles.listScreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.listHeader}>
            <Text style={styles.sheetTitle}>Наблизо</Text>
            <Pressable onPress={() => setListOpen(false)} hitSlop={8}>
              <Text style={styles.photoButtonText}>Затвори</Text>
            </Pressable>
          </View>
          <ThemeSwitch />
          <Text style={styles.radiusLabel}>{Math.round(radiusKm)} км</Text>
          <Slider
            style={styles.slider}
            minimumValue={1}
            maximumValue={30}
            step={1}
            value={radiusKm}
            minimumTrackTintColor={colors.sliderMin}
            maximumTrackTintColor={colors.sliderMax}
            thumbTintColor={colors.accent}
            onValueChange={(value) => setRadiusKm(value)}
            onSlidingComplete={(value) => loadNearby(value)}
          />
          <View style={styles.filters}>
            <Pressable onPress={() => setListCategory('')} style={[styles.chip, listCategory === '' && styles.chipOn]}>
              <Text style={[styles.chipText, listCategory === '' && styles.chipTextOn]}>Всички</Text>
            </Pressable>
            {CATEGORIES.map((item) => (
              <Pressable
                key={item.id}
                onPress={() => setListCategory(item.id)}
                style={[styles.chip, listCategory === item.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, listCategory === item.id && styles.chipTextOn]}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          {nearbyLoading ? <ActivityIndicator color={colors.spinner} style={styles.listSpinner} /> : null}
          {nearbyError ? <Text style={styles.optional}>{nearbyError}</Text> : null}
          <FlatList
            style={styles.list}
            data={nearby.filter((pin) => !listCategory || pin.category === listCategory)}
            keyExtractor={(pin) => String(pin.id)}
            contentContainerStyle={nearby.length === 0 ? styles.listEmptyWrap : undefined}
            ListEmptyComponent={!nearbyLoading && !nearbyError ? (
              <Text style={styles.optional}>
                {nearby.length ? 'Няма нищо в тази категория.' : `Няма нищо в радиус от ${Math.round(radiusKm)} км.`}
              </Text>
            ) : null}
            renderItem={({ item }) => (
              <View style={styles.listRow}>
                <Pressable style={styles.listMain} onPress={() => focusPin(item)}>
                  {item.image_url ? <Image source={{ uri: item.image_url }} style={styles.listThumb} /> : null}
                  <View style={styles.listCopy}>
                    <Text numberOfLines={2} style={styles.listMessage}>{item.message}</Text>
                    {categoryLabel(item.category) ? (
                      <Text style={styles.listCategory}>{categoryLabel(item.category)}</Text>
                    ) : null}
                    <Text style={styles.listMeta}>{formatDistance(item.km)} · {timeLeft(item.expires_at, now)}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => copyPinLink(item)} hitSlop={8}>
                  <Text style={styles.copyLink}>{copiedPinId === item.id ? 'Копирано' : 'Копирай връзката'}</Text>
                </Pressable>
              </View>
            )}
          />
        </View>
      </Modal>

      <Modal visible={composer != null} animationType="slide" transparent onRequestClose={() => setComposer(null)}>
        <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.sheetBackdrop} onPress={() => !saving && setComposer(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>Пин тук</Text>
              <Text style={styles.sheetHint}>Този пин ползва мястото, където стоиш.</Text>
              <View style={styles.filters}>
                {CATEGORIES.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setCategory(item.id)}
                    style={[styles.chip, category === item.id && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, category === item.id && styles.chipTextOn]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Кратко съобщение"
                placeholderTextColor={colors.faint}
                keyboardAppearance={dark ? 'dark' : 'light'}
                maxLength={80}
                multiline
                style={styles.input}
              />
              <Text style={styles.count}>{message.trim().length}/80</Text>
              {image ? <Image source={{ uri: image }} style={styles.preview} /> : null}
              <View style={styles.photoRow}>
                <Pressable onPress={() => choosePhoto(true)} style={styles.photoButton}>
                  <Text style={styles.photoButtonText}>Снимай</Text>
                </Pressable>
                <Pressable onPress={() => choosePhoto(false)} style={styles.photoButton}>
                  <Text style={styles.photoButtonText}>Избери снимка</Text>
                </Pressable>
                {image ? (
                  <Pressable onPress={() => setImage(null)}>
                    <Text style={styles.removePhoto}>Махни</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.optional}>По избор</Text>
                )}
              </View>
              <View style={styles.durations}>
                {DURATIONS.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => setDuration(item.id)}
                    style={[styles.chip, duration === item.id && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, duration === item.id && styles.chipTextOn]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                style={[styles.drop, (!message.trim() || saving) && styles.dropOff]}
                onPress={dropPin}
                disabled={!message.trim() || saving}
              >
                {saving ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.dropText}>Пусни пин</Text>}
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={selected != null} animationType="slide" transparent onRequestClose={() => setSelected(null)}>
        <KeyboardAvoidingView style={styles.sheetWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSelected(null)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            <ScrollView keyboardShouldPersistTaps="handled">
              {selected?.image_url ? (
                <Image source={{ uri: selected.image_url }} style={styles.detailImage} />
              ) : null}
              <Text style={styles.sheetTitle}>{selected?.message}</Text>
              {categoryLabel(selected?.category) ? (
                <Text style={styles.listCategory}>{categoryLabel(selected.category)}</Text>
              ) : null}
              <Text style={styles.sheetHint}>{selected ? timeLeft(selected.expires_at, now) : ''}</Text>
              {selected ? (
                <View style={styles.shareRow}>
                  <Pressable onPress={() => copyPinLink(selected)} hitSlop={8}>
                    <Text style={styles.shareText}>{copiedPinId === selected.id ? 'Копирано' : 'Копирай връзката към пина'}</Text>
                  </Pressable>
                  <Pressable onPress={() => sharePin(selected)} hitSlop={8}>
                    <Text style={styles.shareText}>Сподели</Text>
                  </Pressable>
                </View>
              ) : null}
              {replyError ? <Text style={styles.optional}>{replyError}</Text> : null}
              {replies.map((reply) => (
                <View key={reply.id} style={[styles.reply, reply.mine && styles.replyMine]}>
                  <Text style={[styles.replyText, reply.mine && styles.replyTextMine]}>{reply.message}</Text>
                  <Text style={[styles.replyTime, reply.mine && styles.replyTimeMine]}>
                    {reply.mine ? 'Ти · ' : ''}{timeAgo(reply.created_at, now)}
                  </Text>
                  {reply.author_only ? (
                    <Text style={[styles.replyTime, reply.mine && styles.replyTimeMine]}>
                      {reply.mine ? 'Само за автора' : 'Само за теб'}
                    </Text>
                  ) : null}
                </View>
              ))}
              {selected?.mine ? (
                <Pressable style={styles.remove} onPress={() => removePin(selected)}>
                  <Text style={styles.removeText}>Махни пина</Text>
                </Pressable>
              ) : (
                <>
                  {selected?.replied ? (
                    <Text style={styles.replySent}>Отговорът е изпратен.</Text>
                  ) : (
                    <>
                      <TextInput
                        value={replyText}
                        onChangeText={setReplyText}
                        placeholder="Имаш право само на 1 отговор"
                        placeholderTextColor={colors.faint}
                        keyboardAppearance={dark ? 'dark' : 'light'}
                        maxLength={200}
                        multiline
                        style={styles.input}
                      />
                      <Pressable style={styles.checkRow} onPress={() => setAuthorOnly((value) => !value)}>
                        <View style={[styles.box, authorOnly && styles.boxOn]}>
                          {authorOnly ? <Text style={styles.boxMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.checkLabel}>Видимо само за автора на пина</Text>
                      </Pressable>
                      <Text style={styles.count}>{replyText.trim().length}/200</Text>
                      <Pressable
                        style={[styles.drop, (!replyText.trim() || sendingReply) && styles.dropOff]}
                        onPress={sendReply}
                        disabled={!replyText.trim() || sendingReply}
                      >
                        {sendingReply ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.dropText}>Изпрати отговор</Text>}
                      </Pressable>
                    </>
                  )}
                  {selected?.reported ? (
                    <Text style={styles.reported}>Докладвано.</Text>
                  ) : (
                    <Pressable onPress={() => confirmReport(selected)} disabled={reporting} style={styles.report}>
                      <Text style={styles.reportText}>{reporting ? 'Докладва се...' : 'Докладвай'}</Text>
                    </Pressable>
                  )}
                </>
              )}
              <Pressable onPress={() => setSelected(null)} style={styles.close}>
                <Text style={styles.photoButtonText}>Затвори</Text>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function createStyles(c) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    credit: { position: 'absolute', left: 12, color: c.credit, fontSize: 11 },
    banner: {
      position: 'absolute',
      left: 16,
      right: 120,
      backgroundColor: c.button,
      borderRadius: 12,
      padding: 12,
    },
    bannerText: { color: c.onButton, textAlign: 'center' },
    notice: {
      position: 'absolute',
      left: 16,
      right: 16,
      backgroundColor: c.button,
      borderRadius: 14,
      padding: 12,
    },
    noticeTitle: { color: c.onButton, fontWeight: '700' },
    noticeBody: { color: c.onButton, marginTop: 4 },
    hint: {
      position: 'absolute',
      left: 16,
      right: 16,
      backgroundColor: c.hint,
      borderRadius: 12,
      padding: 12,
    },
    hintText: { color: c.hintText, textAlign: 'center' },
    cityRow: { position: 'absolute', left: 0, right: 0 },
    cityRowContent: { paddingHorizontal: 16, gap: 8 },
    cityPill: {
      backgroundColor: c.hint,
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    cityPillText: { color: c.ink, fontWeight: '700' },
    cityMore: { backgroundColor: c.button },
    cityMoreText: { color: c.onButton, fontWeight: '700' },
    citySearch: {
      marginTop: 16,
      borderRadius: 14,
      backgroundColor: c.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.ink,
    },
    cityChoice: {
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    cityChoiceText: { color: c.ink, fontSize: 18, fontWeight: '700' },
    themePill: { position: 'absolute', left: 16 },
    locate: {
      position: 'absolute',
      left: 16,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    locateRing: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: c.ink,
    },
    listButton: {
      position: 'absolute',
      right: 16,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.button,
      alignItems: 'center',
      justifyContent: 'center',
    },
    listIcon: { width: 18, gap: 4 },
    listBar: { height: 2, borderRadius: 1, backgroundColor: c.onButton },
    listScreen: { flex: 1, backgroundColor: c.surface, paddingHorizontal: 20 },
    list: { flex: 1 },
    filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 8 },
    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    radiusLabel: { marginTop: 18, color: c.ink, fontWeight: '700', fontSize: 16 },
    slider: { width: '100%', height: 40 },
    listSpinner: { marginVertical: 8, alignSelf: 'flex-start' },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.line,
    },
    listMain: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
    },
    copyLink: { color: c.accent, fontWeight: '700', paddingVertical: 8 },
    shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8, marginBottom: 8 },
    shareText: { color: c.accent, fontWeight: '700', fontSize: 16 },
    listThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: c.thumb },
    listCopy: { flex: 1 },
    listMessage: { color: c.ink, fontSize: 16, fontWeight: '600' },
    listCategory: { marginTop: 2, color: c.muted, fontSize: 13, fontWeight: '600' },
    listMeta: { marginTop: 4, color: c.faint, fontSize: 13 },
    listEmptyWrap: { paddingTop: 24 },
    pinButton: {
      position: 'absolute',
      right: 16,
      backgroundColor: c.button,
      borderRadius: 999,
      minWidth: 112,
      minHeight: 48,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinButtonText: { color: c.onButton, fontWeight: '700', fontSize: 16 },
    sheetWrap: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: c.backdrop },
    sheet: {
      backgroundColor: c.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      padding: 20,
      maxHeight: '80%',
    },
    sheetTitle: { fontSize: 22, fontWeight: '700', color: c.ink },
    sheetHint: { marginTop: 4, marginBottom: 14, color: c.muted },
    input: {
      minHeight: 72,
      borderRadius: 14,
      backgroundColor: c.card,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      color: c.ink,
      textAlignVertical: 'top',
    },
    count: { alignSelf: 'flex-end', marginTop: 4, color: c.faint, fontSize: 12 },
    photoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' },
    preview: { width: 72, height: 72, borderRadius: 10, marginTop: 12, backgroundColor: c.thumb },
    detailImage: { width: '100%', height: 220, borderRadius: 14, marginBottom: 14, backgroundColor: c.thumb },
    photoButton: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: c.ink,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    photoButtonText: { color: c.ink, fontWeight: '600' },
    optional: { color: c.faint },
    removePhoto: { color: c.accent, fontWeight: '600' },
    durations: { flexDirection: 'row', gap: 8, marginTop: 16 },
    chip: { borderRadius: 999, backgroundColor: c.card, paddingHorizontal: 12, paddingVertical: 8 },
    chipOn: { backgroundColor: c.button },
    chipText: { color: c.ink, fontWeight: '600' },
    chipTextOn: { color: c.onButton },
    drop: {
      marginTop: 18,
      backgroundColor: c.accent,
      borderRadius: 14,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dropOff: { opacity: 0.45 },
    dropText: { color: c.onAccent, fontWeight: '700', fontSize: 16 },
    reply: {
      backgroundColor: c.card,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 8,
    },
    replyMine: { backgroundColor: c.replyMine },
    replyText: { color: c.ink, fontSize: 16 },
    replyTextMine: { color: c.replyMineText },
    replyTime: { color: c.faint, fontSize: 12, marginTop: 4 },
    replyTimeMine: { color: c.replyMineTime },
    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
    box: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    boxOn: { backgroundColor: c.button },
    boxMark: { color: c.onButton, fontSize: 14, fontWeight: '700' },
    checkLabel: { flex: 1, color: c.ink, fontSize: 15 },
    replySent: { color: c.ink, fontWeight: '600', marginBottom: 8 },
    reported: { color: c.faint, marginTop: 14 },
    report: { alignSelf: 'flex-start', marginTop: 14, paddingVertical: 6 },
    reportText: { color: c.accent, fontWeight: '600' },
    remove: {
      backgroundColor: c.button,
      borderRadius: 14,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    removeText: { color: c.onButton, fontWeight: '700' },
    close: { alignSelf: 'center', marginTop: 14, padding: 8 },
  });
}
