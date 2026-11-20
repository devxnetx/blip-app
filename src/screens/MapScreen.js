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
import MapView, { Marker } from 'react-native-maps';
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
import { parseLocalStart, timeAgo, timeLeft, upcomingLabel } from '../time';
import { FALLBACK_CATEGORIES, loadCategories } from '../categories';
import { useTheme } from '../theme';

const SOFIA = {
  latitude: 42.6977,
  longitude: 23.3219,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

// Opening zoom. GPS is a few blocks; a detected city is the city itself.
const GPS_ZOOM = 0.01;
const CITY_ZOOM = 0.04;
const CITY_PICK_ZOOM = 0.022;
const PIN_FOCUS_ZOOM = 0.008;

const DURATIONS = [
  { id: '5m', label: '5 мин' },
  { id: '1h', label: '1 час' },
  { id: '24h', label: '24 часа' },
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

function foldPlace(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, ' ')
    .trim();
}

function cityFromIp(point) {
  const label = foldPlace(point?.city);
  if (label) {
    const named = CITIES.find((city) => {
      const phrases = [foldPlace(city.find), foldPlace(city.name)].filter(Boolean);
      return phrases.some((phrase) => phrase === label || phrase.split(' ').includes(label));
    });
    if (named) {
      return named;
    }
  }

  let best = null;
  let bestKm = 45;
  CITIES.forEach((city) => {
    const km = kmBetween(point.latitude, point.longitude, city.latitude, city.longitude);
    if (km < bestKm) {
      bestKm = km;
      best = city;
    }
  });
  return best;
}

function mapRegion(latitude, longitude, delta) {
  return {
    latitude,
    longitude,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

function MeMarker({ coordinate, facing }) {
  const { colors } = useTheme();
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => setTracking(false), 300);
    return () => clearTimeout(timer);
  }, [coordinate, facing, colors]);

  return (
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking} zIndex={10000}>
      <View style={meStyles.wrap} collapsable={false}>
        {facing == null ? null : (
          <View style={[meStyles.beam, { transform: [{ rotate: `${facing}deg` }] }]}>
            <View style={[meStyles.cone, { borderTopColor: colors.me }]} />
          </View>
        )}
        <View style={[meStyles.dot, { backgroundColor: colors.me, borderColor: colors.meBorder }]} />
      </View>
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
  const [bootCover, setBootCover] = useState(true);
  const userMoved = useRef(false);
  const bootSet = useRef(false);
  const openTarget = useRef(null);
  const openPlayed = useRef(false);
  const bootAt = useRef(0);
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
  const [whenMode, setWhenMode] = useState('now');
  const [startsAt, setStartsAt] = useState('');
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [category, setCategory] = useState('other');
  const [listCategory, setListCategory] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [replies, setReplies] = useState([]);
  const [replyError, setReplyError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [authorOnly, setAuthorOnly] = useState(false);
  const [me, setMe] = useState(null);
  const [heading, setHeading] = useState(null);
  const [mapHeading, setMapHeading] = useState(0);
  const mapHeadingRef = useRef(0);
  const headingSyncAt = useRef(0);
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
  const [markerStamp, setMarkerStamp] = useState(0);

  const load = useCallback(async (nextRegion) => {
    const requestId = ++requestRef.current;
    try {
      const device = deviceRef.current || await deviceId();
      deviceRef.current = device;
      const rows = await fetchPins(nextRegion, device);
      if (requestId !== requestRef.current) {
        return;
      }
      setPins(rows.filter((pin) => (
        pin.latitude != null
        && pin.longitude != null
        && pin.kind !== 'unassigned'
        && new Date(pin.expires_at).getTime() > Date.now()
      )));
      setError('');
    } catch {
      if (requestId === requestRef.current) {
        setError('Картата не успя да зареди пиновете.');
      }
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    loadCategories().then((next) => {
      if (!stopped) {
        setCategories(next);
      }
    });
    return () => {
      stopped = true;
    };
  }, []);

  useEffect(() => {
    if (categories.some((item) => item.id === category)) {
      return;
    }
    const next = categories.find((item) => item.id === 'other') || categories[0];
    if (next) {
      setCategory(next.id);
    }
  }, [categories, category]);

  function categoryLabel(id) {
    return categories.find((item) => item.id === id)?.label || '';
  }

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

  function syncMapHeading() {
    const now = Date.now();
    if (now - headingSyncAt.current < 180) {
      return;
    }
    headingSyncAt.current = now;
    const map = mapRef.current;
    if (!map?.getCamera) {
      return;
    }
    map.getCamera().then((camera) => {
      const next = Number(camera?.heading);
      if (!Number.isFinite(next)) {
        return;
      }
      const wrapped = ((next % 360) + 360) % 360;
      if (Math.abs(mapHeadingRef.current - wrapped) < 2) {
        return;
      }
      mapHeadingRef.current = wrapped;
      setMapHeading(wrapped);
    }).catch(() => {});
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
    load(next);
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
    const delta = Math.min(current.latitudeDelta || PIN_FOCUS_ZOOM, PIN_FOCUS_ZOOM);
    userMoved.current = true;
    setListOpen(false);
    setPins((current) => (current.some((item) => item.id === pin.id) ? current : [pin, ...current]));
    moveTo({
      latitude: pin.latitude,
      longitude: pin.longitude,
      latitudeDelta: delta,
      longitudeDelta: delta,
    });
  }

  async function pinHere() {
    setFinding(true);
    setError('');
    try {
      let latitude = me?.latitude;
      let longitude = me?.longitude;
      if (latitude == null || longitude == null) {
        const next = await readLocation();
        if (!next) {
          return;
        }
        latitude = next.latitude;
        longitude = next.longitude;
        setMe({ latitude, longitude });
      }
      const current = regionRef.current;
      const delta = Math.min(current.latitudeDelta || GPS_ZOOM, GPS_ZOOM);
      userMoved.current = true;
      moveTo({
        latitude,
        longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      });
      await new Promise((resolve) => setTimeout(resolve, 450));
      setMessage('');
      setImage(null);
      setDuration('1h');
      setWhenMode('now');
      setStartsAt('');
      setCategory('other');
      setSelected(null);
      setComposer({ latitude, longitude });
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

    let startIso = null;
    if (whenMode === 'upcoming') {
      const parsed = parseLocalStart(startsAt);
      if (!parsed) {
        Alert.alert('Датата не е ясна', 'Напиши я като ДД.ММ.ГГГГ ЧЧ:ММ.');
        return;
      }
      if (parsed.getTime() <= Date.now()) {
        Alert.alert('Датата е минала', 'Избери бъдещ час.');
        return;
      }
      startIso = parsed.toISOString();
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
        kind: whenMode === 'upcoming' ? 'upcoming' : 'normal',
        startsAt: startIso,
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

  function playOpenZoom() {
    const target = openTarget.current;
    if (!target || openPlayed.current || !mapRef.current || Date.now() - bootAt.current < 400) {
      return;
    }
    openPlayed.current = true;
    setBootCover(false);
    mapRef.current.animateToRegion(target, 1100);
    setTimeout(() => setMarkerStamp((value) => value + 1), 1200);
  }

  useEffect(() => {
    if (!bootRegion) {
      return undefined;
    }
    const timer = setInterval(() => {
      playOpenZoom();
      if (openPlayed.current) {
        clearInterval(timer);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [bootRegion]);

  useEffect(() => {
    let cancelled = false;
    let watch;
    let compass;

    function reveal(target) {
      if (cancelled || bootSet.current) {
        return;
      }
      const wideDelta = Math.min(Math.max(target.latitudeDelta * 3.4, 0.09), 0.16);
      const wide = mapRegion(target.latitude, target.longitude, wideDelta);
      openTarget.current = target;
      bootAt.current = Date.now();
      bootSet.current = true;
      regionRef.current = wide;
      setRegion(wide);
      setBootRegion(wide);
      load(wide);
    }

    function settleOnGps(latitude, longitude) {
      if (cancelled) {
        return;
      }
      setMe({ latitude, longitude });
      if (userMoved.current) {
        return;
      }
      const next = mapRegion(latitude, longitude, GPS_ZOOM);
      if (!bootSet.current) {
        reveal(next);
        return;
      }
      if (!openPlayed.current) {
        const planned = openTarget.current;
        const moved = !planned || kmBetween(
          planned.latitude,
          planned.longitude,
          latitude,
          longitude,
        ) > 0.05;
        if (moved) {
          openTarget.current = next;
        }
        return;
      }
      const km = kmBetween(
        regionRef.current.latitude,
        regionRef.current.longitude,
        latitude,
        longitude,
      );
      const stillWide = regionRef.current.latitudeDelta > GPS_ZOOM * 1.8;
      if (km <= 0.3 && !stillWide) {
        return;
      }
      regionRef.current = next;
      setRegion(next);
      mapRef.current?.animateToRegion(next, 900);
      load(next);
    }

    (async () => {
      let status = 'undetermined';
      try {
        status = (await Location.getForegroundPermissionsAsync()).status;
      } catch {
        status = 'denied';
      }

      if (!cancelled && status !== 'granted' && status !== 'denied') {
        try {
          status = (await Location.requestForegroundPermissionsAsync()).status;
        } catch {
          status = 'denied';
        }
      }

      if (cancelled) {
        return;
      }

      let gpsPromise = null;
      if (status === 'granted') {
        Location.watchHeadingAsync((update) => {
          if (cancelled) {
            return;
          }
          const value = update.trueHeading >= 0 ? update.trueHeading : update.magHeading;
          if (!(value >= 0) || update.accuracy < 1) {
            setHeading(null);
            return;
          }
          setHeading((current) => {
            if (current == null) {
              return value;
            }
            const delta = Math.abs(((value - current + 540) % 360) - 180);
            return delta < 4 ? current : value;
          });
        }).then((subscription) => {
          if (cancelled) {
            subscription.remove();
            return;
          }
          compass = subscription;
        }).catch(() => {
          // A phone without a compass keeps the plain dot.
        });

        gpsPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          .catch(() => null);
        const position = await Promise.race([
          gpsPromise,
          new Promise((resolve) => setTimeout(() => resolve(null), 7000)),
        ]);
        if (position?.coords) {
          settleOnGps(position.coords.latitude, position.coords.longitude);
        } else if (!cancelled) {
          try {
            const last = await Location.getLastKnownPositionAsync();
            const recent = last?.timestamp && Date.now() - last.timestamp < 10 * 60 * 1000;
            if (recent && last.coords) {
              settleOnGps(last.coords.latitude, last.coords.longitude);
            }
          } catch {
            // A missing cache falls through to the phone's city.
          }
          gpsPromise.then((late) => {
            if (late?.coords) {
              settleOnGps(late.coords.latitude, late.coords.longitude);
            }
          });
        }
      }

      if (!bootSet.current && !cancelled) {
        const ip = await lookupIpCity();
        if (!cancelled && !bootSet.current) {
          const city = ip ? cityFromIp(ip) : null;
          const point = city || ip || SOFIA;
          reveal(mapRegion(point.latitude, point.longitude, CITY_ZOOM));
        }
      }

      if (cancelled || status !== 'granted') {
        return;
      }

      watch = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, distanceInterval: 40 },
        (position) => {
          if (position?.coords) {
            settleOnGps(position.coords.latitude, position.coords.longitude);
          }
        },
      );
      if (cancelled) {
        watch.remove();
      }
    })();

    return () => {
      cancelled = true;
      watch?.remove();
      compass?.remove();
    };
  }, [load]);

  useEffect(() => {
    setReplyText('');
    setAuthorOnly(false);

    if (!selected || selected.imported) {
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
    if (!text || !selected || selected.imported || sendingReply) {
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
    if (pin?.imported) {
      return;
    }
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
      latitudeDelta: CITY_PICK_ZOOM,
      longitudeDelta: CITY_PICK_ZOOM,
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
        mapType="standard"
        userInterfaceStyle={dark ? 'dark' : 'light'}
        initialRegion={bootRegion}
        onMapReady={playOpenZoom}
        onPanDrag={() => {
          userMoved.current = true;
        }}
        onRegionChange={syncMapHeading}
        onRegionChangeComplete={(next) => {
          syncMapHeading();
          scheduleLoad(next);
        }}
      >
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
            label={categoryLabel(pin.category)}
            stackOffset={pin.stackOffset}
            onPress={() => setSelected(pin)}
            now={now}
            stamp={markerStamp}
          />
        ))}
        {me ? (
          <MeMarker
            coordinate={me}
            facing={heading == null ? null : ((heading - mapHeading) % 360 + 360) % 360}
          />
        ) : null}
      </MapView>

      <Text style={[styles.credit, { top: insets.top + 10 }]}>Карта: Apple</Text>

      {notice ? (
        <Pressable
          style={[styles.notice, { top: insets.top + 36 }]}
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
        <Pressable style={[styles.banner, { top: insets.top + (notice ? 118 : 36) }]} onPress={() => load(regionRef.current)}>
          <Text style={styles.bannerText}>{error} Натисни, за да опиташ пак.</Text>
        </Pressable>
      ) : pins.length === 0 && !notice ? (
        <View style={[styles.hint, { top: insets.top + 36 }]} pointerEvents="none">
          <Text style={styles.hintText}>Още няма нищо наблизо. „Нов пин“ пуска бележка на това място.</Text>
        </View>
      ) : null}

      <View style={[styles.themePill, { bottom: insets.bottom + 74 }]}>
        <ThemeSwitch compact />
      </View>

      <Pressable
        style={[styles.locate, { bottom: insets.bottom + 130 }]}
        onPress={recenter}
        accessibilityLabel="Центрирай на моето място"
      >
        <View style={styles.target}>
          <View style={styles.targetRing} />
          <View style={styles.targetH} />
          <View style={styles.targetV} />
          <View style={styles.targetDot} />
        </View>
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

      <View style={[styles.pinRow, { bottom: insets.bottom + 16 }]}>
        <Pressable
          style={styles.citiesButton}
          onPress={() => {
            setCityQuery('');
            setCitiesOpen(true);
          }}
        >
          <Text style={styles.citiesButtonText}>Градове</Text>
        </Pressable>
        <Pressable style={styles.pinButton} onPress={pinHere} disabled={finding}>
          {finding ? <ActivityIndicator color={colors.onButton} /> : <Text style={styles.pinButtonText}>Нов пин</Text>}
        </Pressable>
      </View>

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
            {categories.map((item) => (
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
                    <Text style={styles.listMeta}>{formatDistance(item.km)} · {upcomingLabel(item, now) || timeAgo(item.created_at, now)}</Text>
                  </View>
                </Pressable>
                <View style={styles.listActions}>
                  <Pressable onPress={() => copyPinLink(item)} style={styles.shareButton}>
                    <Text style={styles.shareText}>{copiedPinId === item.id ? 'Копирано' : 'Копирай'}</Text>
                  </Pressable>
                  <Pressable onPress={() => sharePin(item)} style={styles.shareButton}>
                    <Text style={styles.shareText}>Сподели</Text>
                  </Pressable>
                </View>
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
              <Text style={styles.sheetTitle}>Нов пин</Text>
              <Text style={styles.sheetHint}>Този пин ползва мястото, където стоиш.</Text>
              <View style={styles.filters}>
                {categories.map((item) => (
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
                <Pressable onPress={() => setWhenMode('now')} style={[styles.chip, whenMode === 'now' && styles.chipOn]}>
                  <Text style={[styles.chipText, whenMode === 'now' && styles.chipTextOn]}>Сега</Text>
                </Pressable>
                <Pressable onPress={() => setWhenMode('upcoming')} style={[styles.chip, whenMode === 'upcoming' && styles.chipOn]}>
                  <Text style={[styles.chipText, whenMode === 'upcoming' && styles.chipTextOn]}>Предстоящо</Text>
                </Pressable>
              </View>
              {whenMode === 'upcoming' ? (
                <>
                  <TextInput
                    value={startsAt}
                    onChangeText={setStartsAt}
                    placeholder="ДД.ММ.ГГГГ ЧЧ:ММ"
                    placeholderTextColor={colors.faint}
                    keyboardAppearance={dark ? 'dark' : 'light'}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.input, styles.whenInput]}
                  />
                  <Text style={styles.sheetHint}>Вижда се веднага и изчезва след избраното време от началото.</Text>
                </>
              ) : null}
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
                style={[styles.drop, (!message.trim() || saving || (whenMode === 'upcoming' && !startsAt.trim())) && styles.dropOff]}
                onPress={dropPin}
                disabled={!message.trim() || saving || (whenMode === 'upcoming' && !startsAt.trim())}
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
              <View style={styles.detailRow}>
                {selected?.image_url ? (
                  <Image source={{ uri: selected.image_url }} style={styles.detailImage} />
                ) : null}
                <View style={styles.detailInfo}>
                  <Text style={styles.sheetTitle}>{selected?.message}</Text>
                  {selected ? (
                    <Text style={styles.listCategory}>
                      {[categoryLabel(selected.category), timeAgo(selected.created_at, now)].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                  <Text style={styles.sheetHint}>{selected ? (upcomingLabel(selected, now) || timeLeft(selected.expires_at, now)) : ''}</Text>
                  {selected?.description ? <Text style={styles.story}>{selected.description}</Text> : null}
                </View>
              </View>
              {selected ? (
                <View style={styles.shareRow}>
                  <Pressable onPress={() => copyPinLink(selected)} style={styles.shareButton}>
                    <Text style={styles.shareText}>{copiedPinId === selected.id ? 'Копирано' : 'Копирай връзката към пина'}</Text>
                  </Pressable>
                  <Pressable onPress={() => sharePin(selected)} style={styles.shareButton}>
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
              {selected?.mine && !selected.imported ? (
                <Pressable style={styles.remove} onPress={() => removePin(selected)}>
                  <Text style={styles.removeText}>Махни пина</Text>
                </Pressable>
              ) : selected?.imported ? null : (
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
      {bootCover ? (
        <View style={styles.bootCover}>
          <BootScreen />
        </View>
      ) : null}
    </View>
  );
}

const meStyles = StyleSheet.create({
  wrap: {
    width: 96,
    height: 96,
    alignItems: 'center',
    justifyContent: 'center',
  },
  beam: {
    position: 'absolute',
    width: 96,
    height: 96,
    alignItems: 'center',
  },
  cone: {
    position: 'absolute',
    top: 6,
    width: 0,
    height: 0,
    borderLeftWidth: 26,
    borderRightWidth: 26,
    borderTopWidth: 42,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    opacity: 0.35,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
  },
});

function createStyles(c) {
  return StyleSheet.create({
    fill: { flex: 1, backgroundColor: c.bg },
    bootCover: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 80,
    },
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
      right: 16,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.button,
      alignItems: 'center',
      justifyContent: 'center',
    },
    target: {
      width: 22,
      height: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    targetRing: {
      position: 'absolute',
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 2,
      borderColor: c.onButton,
    },
    targetH: {
      position: 'absolute',
      width: 22,
      height: 2,
      borderRadius: 1,
      backgroundColor: c.onButton,
    },
    targetV: {
      position: 'absolute',
      width: 2,
      height: 22,
      borderRadius: 1,
      backgroundColor: c.onButton,
    },
    targetDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.onButton,
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
    listActions: { gap: 6, alignItems: 'stretch' },
    shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 12 },
    shareButton: {
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: c.accent,
      paddingHorizontal: 14,
      paddingVertical: 8,
      alignItems: 'center',
    },
    shareText: { color: c.accent, fontWeight: '700', fontSize: 14, textAlign: 'center' },
    listThumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: c.thumb },
    listCopy: { flex: 1 },
    listMessage: { color: c.ink, fontSize: 16, fontWeight: '600' },
    listCategory: { marginTop: 2, color: c.muted, fontSize: 13, fontWeight: '600' },
    listMeta: { marginTop: 4, color: c.faint, fontSize: 13 },
    listEmptyWrap: { paddingTop: 24 },
    pinRow: {
      position: 'absolute',
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    citiesButton: {
      backgroundColor: c.button,
      borderRadius: 999,
      minHeight: 48,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    citiesButtonText: { color: c.onButton, fontWeight: '700', fontSize: 16 },
    pinButton: {
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
    story: { marginTop: 4, marginBottom: 14, color: c.muted, fontSize: 15, lineHeight: 21 },
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
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
    detailInfo: { flex: 1, minWidth: 0 },
    detailImage: { width: 112, height: 112, borderRadius: 14, backgroundColor: c.thumb },
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
    whenInput: { minHeight: 48, marginTop: 12, textAlignVertical: 'center' },
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
