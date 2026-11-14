/**
 * Every icon used in the app. Each is loaded from its own file so only these ship in the bundle
 * (importing the package root would bundle all ~1,500 icons). Types come from the package's
 * published definitions rather than its raw source.
 * Icons: Phosphor (https://phosphoricons.com), MIT licence.
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import type { Icon } from 'phosphor-react-native';

export const ArrowLeftIcon: Icon = require('phosphor-react-native/src/icons/ArrowLeft').ArrowLeftIcon;
export const BarbellIcon: Icon = require('phosphor-react-native/src/icons/Barbell').BarbellIcon;
export const BellIcon: Icon = require('phosphor-react-native/src/icons/Bell').BellIcon;
export const CaretRightIcon: Icon = require('phosphor-react-native/src/icons/CaretRight').CaretRightIcon;
export const CrosshairIcon: Icon = require('phosphor-react-native/src/icons/Crosshair').CrosshairIcon;
export const EnvelopeSimpleIcon: Icon = require('phosphor-react-native/src/icons/EnvelopeSimple').EnvelopeSimpleIcon;
export const HouseIcon: Icon = require('phosphor-react-native/src/icons/House').HouseIcon;
export const LockSimpleIcon: Icon = require('phosphor-react-native/src/icons/LockSimple').LockSimpleIcon;
export const MagnifyingGlassIcon: Icon = require('phosphor-react-native/src/icons/MagnifyingGlass').MagnifyingGlassIcon;
export const MapPinIcon: Icon = require('phosphor-react-native/src/icons/MapPin').MapPinIcon;
export const PersonSimpleRunIcon: Icon = require('phosphor-react-native/src/icons/PersonSimpleRun').PersonSimpleRunIcon;
export const QrCodeIcon: Icon = require('phosphor-react-native/src/icons/QrCode').QrCodeIcon;
export const ReceiptIcon: Icon = require('phosphor-react-native/src/icons/Receipt').ReceiptIcon;
export const ShoppingBagIcon: Icon = require('phosphor-react-native/src/icons/ShoppingBag').ShoppingBagIcon;
export const StarIcon: Icon = require('phosphor-react-native/src/icons/Star').StarIcon;
export const UserCircleIcon: Icon = require('phosphor-react-native/src/icons/UserCircle').UserCircleIcon;
export const UsersThreeIcon: Icon = require('phosphor-react-native/src/icons/UsersThree').UsersThreeIcon;
export const WarningCircleIcon: Icon = require('phosphor-react-native/src/icons/WarningCircle').WarningCircleIcon;
export const WifiSlashIcon: Icon = require('phosphor-react-native/src/icons/WifiSlash').WifiSlashIcon;
