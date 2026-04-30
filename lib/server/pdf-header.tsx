import React from 'react'
import { Image, Text, View } from '@react-pdf/renderer'

type StatusStyle = Record<string, unknown>

function formatAddressLines(raw: string | null | undefined): string[] {
  const s = typeof raw === 'string' ? raw.trim() : ''
  if (!s) return []
  return s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 4)
}

export function PdfHeader({
  themeColor,
  titleLeft,
  titleRight,
  numberLabel,
  numberValue,
  logoDataUri,
  brand,
  brandSub,
  statusText,
  statusStyle,
  contactAddress,
  contactPhone,
  contactEmail,
  projectName,
  projectAddress,
  mutedColor = '#64748b',
  titleAccentColor = themeColor,
  borderColor = '#e2e8f0',
}: {
  themeColor: string
  titleLeft: string
  titleRight?: string | null
  numberLabel: string
  numberValue: string
  logoDataUri?: string | null
  brand: string
  brandSub?: string | null
  statusText: string
  statusStyle: StatusStyle
  contactAddress?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  projectName: string
  projectAddress?: string | null
  mutedColor?: string
  titleAccentColor?: string
  borderColor?: string
}) {
  return (
    <>
      {/* Title bar + document number */}
      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View
          style={{
            flex: 1,
            backgroundColor: themeColor,
            borderRadius: 7,
            minHeight: 36,
            justifyContent: 'center',
            paddingHorizontal: 14,
            marginRight: 6,
          }}
        >
          <Text style={{ color: '#ffffff', textAlign: 'center' }}>
            <Text style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>
              {titleLeft}
              {titleRight ? ' ' : ''}
            </Text>
            {titleRight ? (
              <Text style={{ fontWeight: 700, fontSize: 12, letterSpacing: 0.2 }}>{titleRight}</Text>
            ) : null}
          </Text>
        </View>

        <View
          style={{
            width: 108,
            backgroundColor: themeColor,
            borderRadius: 7,
            minHeight: 36,
            paddingVertical: 6,
            paddingHorizontal: 10,
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: '#ffffff', fontSize: 7, textAlign: 'center', textTransform: 'uppercase', fontWeight: 700 }}>
            {numberLabel}
          </Text>
          <Text style={{ color: '#ffffff', fontWeight: 800, fontSize: 12, textAlign: 'center', marginTop: 2 }}>
            {numberValue}
          </Text>
        </View>
      </View>

      {/* Company / Project header block */}
      <View
        style={{
          borderWidth: 1,
          borderColor,
          borderRadius: 7,
          paddingHorizontal: 10,
          paddingVertical: 8,
          marginBottom: 10,
        }}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, paddingRight: 10 }}>
            {logoDataUri ? <Image src={logoDataUri} style={{ width: 52, height: 52 }} /> : null}
            <View style={{ marginLeft: logoDataUri ? 10 : 0, flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: 800, color: titleAccentColor, letterSpacing: 0.2 }}>
                {(brand || '').toUpperCase()}
              </Text>
              {brandSub ? (
                <Text style={{ fontSize: 7.5, color: mutedColor, letterSpacing: 2.2, marginTop: 1 }}>
                  {brandSub.toUpperCase()}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 6.2, color: mutedColor, textTransform: 'uppercase', fontWeight: 800, marginBottom: 3 }}>
              STATUS
            </Text>
            <Text
              style={{
                alignSelf: 'flex-start',
                fontSize: 7.8,
                fontWeight: 900,
                paddingVertical: 4,
                paddingHorizontal: 14,
                borderRadius: 10,
                ...(statusStyle as any),
              }}
            >
              {statusText}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 8, flexDirection: 'row' }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: 9.6, fontWeight: 800, color: '#0f172a', marginBottom: 3 }}>{brand}</Text>
            {formatAddressLines(contactAddress).map((line, idx) => (
              <Text key={`caddr-${idx}`} style={{ fontSize: 8.4, color: '#0f172a', lineHeight: 1.25 }}>
                {line}
              </Text>
            ))}
            {contactPhone || contactEmail ? (
              <Text style={{ fontSize: 8.2, color: '#0f172a', marginTop: 3 }}>
                {contactPhone || ''} {contactPhone && contactEmail ? ' | ' : ''} {contactEmail || ''}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 1, backgroundColor: borderColor }} />
          <View style={{ flex: 1, paddingLeft: 10 }}>
            <Text style={{ fontSize: 6.5, color: mutedColor, textTransform: 'uppercase', marginBottom: 3, fontWeight: 800 }}>
              PROJECT
            </Text>
            <Text style={{ fontSize: 10, fontWeight: 900, color: '#0f172a', marginBottom: 2 }}>{projectName}</Text>
            {formatAddressLines(projectAddress).map((line, idx) => (
              <Text
                key={`paddr-${idx}`}
                style={{ fontSize: 8.6, color: '#0f172a', lineHeight: 1.25, marginTop: idx === 0 ? 1 : 0 }}
              >
                {line}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </>
  )
}

