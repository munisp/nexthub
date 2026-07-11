// Package iso20022 implements ISO 20022 message building for the
// Central Bank Liquidity Adapter. It produces pacs.009.001.08 (Financial
// Institution Credit Transfer) and camt.054.001.08 (Bank-to-Customer
// Debit/Credit Notification) messages required by most CBN-compatible RTGS
// systems (Temenos, Finacle, Flexcube).
package iso20022

import (
	"encoding/xml"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ─── pacs.009.001.08 — Financial Institution Credit Transfer ─────────────────

// Pacs009Document is the root XML element for a pacs.009 message.
type Pacs009Document struct {
	XMLName xml.Name    `xml:"urn:iso:std:iso:20022:tech:xsd:pacs.009.001.08 Document"`
	FICdtTrf FICdtTrfMsg `xml:"FICdtTrf"`
}

type FICdtTrfMsg struct {
	GrpHdr   Pacs009GrpHdr   `xml:"GrpHdr"`
	CdtTrfTx []CdtTrfTxInfo  `xml:"CdtTrfTxInf"`
}

type Pacs009GrpHdr struct {
	MsgId    string `xml:"MsgId"`
	CreDtTm  string `xml:"CreDtTm"`
	NbOfTxs  string `xml:"NbOfTxs"`
	SttlmInf SttlmInf `xml:"SttlmInf"`
}

type SttlmInf struct {
	SttlmMtd string `xml:"SttlmMtd"` // CLRG = Clearing, COVE = Cover, INDA = Instructed Agent
}

type CdtTrfTxInfo struct {
	PmtId    PmtId    `xml:"PmtId"`
	IntrBkSttlmAmt IntrBkSttlmAmt `xml:"IntrBkSttlmAmt"`
	IntrBkSttlmDt  string         `xml:"IntrBkSttlmDt"`
	InstgAgt FinancialInstitution `xml:"InstgAgt"`
	InstdAgt FinancialInstitution `xml:"InstdAgt"`
	Dbtr     FinancialInstitution `xml:"Dbtr"`
	DbtrAcct Account              `xml:"DbtrAcct"`
	Cdtr     FinancialInstitution `xml:"Cdtr"`
	CdtrAcct Account              `xml:"CdtrAcct"`
	RmtInf   RemittanceInfo       `xml:"RmtInf"`
}

type PmtId struct {
	InstrId    string `xml:"InstrId"`
	EndToEndId string `xml:"EndToEndId"`
	TxId       string `xml:"TxId"`
}

type IntrBkSttlmAmt struct {
	Ccy   string  `xml:"Ccy,attr"`
	Value float64 `xml:",chardata"`
}

type FinancialInstitution struct {
	FinInstnId FinInstnId `xml:"FinInstnId"`
}

type FinInstnId struct {
	BICFI  string `xml:"BICFI,omitempty"`
	ClrSysMmbId ClrSysMmbId `xml:"ClrSysMmbId,omitempty"`
	Nm     string `xml:"Nm,omitempty"`
}

type ClrSysMmbId struct {
	ClrSysId ClrSysId `xml:"ClrSysId"`
	MmbId    string   `xml:"MmbId"`
}

type ClrSysId struct {
	Cd string `xml:"Cd"` // e.g. "NGNIBSS" for NIBSS clearing
}

type Account struct {
	Id AccountId `xml:"Id"`
	Ccy string   `xml:"Ccy,omitempty"`
}

type AccountId struct {
	IBAN  string `xml:"IBAN,omitempty"`
	Othr  OthrId `xml:"Othr,omitempty"`
}

type OthrId struct {
	Id   string `xml:"Id"`
	SchmeNm SchmeNm `xml:"SchmeNm,omitempty"`
}

type SchmeNm struct {
	Cd string `xml:"Cd,omitempty"` // e.g. "BBAN", "NUBAN"
}

type RemittanceInfo struct {
	Ustrd string `xml:"Ustrd"` // Unstructured remittance info
}

// ─── NetPosition represents a single DFSP net settlement position ────────────

type NetPosition struct {
	WindowID    string
	DFSPID      string
	BIC         string
	NUBANAccount string
	BankCode    string
	NetAmountKobo int64  // positive = credit, negative = debit
	Currency    string
}

// ─── BuildPacs009 constructs a pacs.009.001.08 XML message ───────────────────
// Each debit net position becomes a credit transfer FROM the DFSP TO the hub's
// settlement account at the Central Bank.

func BuildPacs009(
	hubBIC string,
	hubSettlementAccount string,
	positions []NetPosition,
	settlementDate time.Time,
) ([]byte, string, error) {
	msgID := fmt.Sprintf("NEXTHUB-%s-%s", settlementDate.Format("20060102"), uuid.New().String()[:8])
	now := time.Now().UTC().Format(time.RFC3339)
	settleDate := settlementDate.Format("2006-01-02")

	var txns []CdtTrfTxInfo
	for i, pos := range positions {
		if pos.NetAmountKobo == 0 {
			continue
		}
		// Only debit positions owe money to the hub
		amountNaira := float64(abs64(pos.NetAmountKobo)) / 100.0
		direction := "CREDIT"
		if pos.NetAmountKobo > 0 {
			direction = "DEBIT" // Hub owes DFSP
		}
		_ = direction

		txns = append(txns, CdtTrfTxInfo{
			PmtId: PmtId{
				InstrId:    fmt.Sprintf("%s-TX%04d", msgID, i+1),
				EndToEndId: fmt.Sprintf("STTL-%s-%s", pos.WindowID, pos.DFSPID),
				TxId:       uuid.New().String(),
			},
			IntrBkSttlmAmt: IntrBkSttlmAmt{
				Ccy:   pos.Currency,
				Value: amountNaira,
			},
			IntrBkSttlmDt: settleDate,
			InstgAgt: FinancialInstitution{
				FinInstnId: FinInstnId{BICFI: hubBIC, Nm: "NextHub Central Switch"},
			},
			InstdAgt: FinancialInstitution{
				FinInstnId: FinInstnId{
					BICFI: pos.BIC,
					ClrSysMmbId: ClrSysMmbId{
						ClrSysId: ClrSysId{Cd: "NGNIBSS"},
						MmbId:    pos.BankCode,
					},
				},
			},
			Dbtr: FinancialInstitution{
				FinInstnId: FinInstnId{BICFI: pos.BIC, Nm: pos.DFSPID},
			},
			DbtrAcct: Account{
				Id:  AccountId{Othr: OthrId{Id: pos.NUBANAccount, SchmeNm: SchmeNm{Cd: "NUBAN"}}},
				Ccy: pos.Currency,
			},
			Cdtr: FinancialInstitution{
				FinInstnId: FinInstnId{BICFI: hubBIC, Nm: "NextHub Settlement Account"},
			},
			CdtrAcct: Account{
				Id:  AccountId{Othr: OthrId{Id: hubSettlementAccount, SchmeNm: SchmeNm{Cd: "NUBAN"}}},
				Ccy: pos.Currency,
			},
			RmtInf: RemittanceInfo{
				Ustrd: fmt.Sprintf("NEXTHUB SETTLEMENT WINDOW %s DFSP %s", pos.WindowID, pos.DFSPID),
			},
		})
	}

	doc := Pacs009Document{
		FICdtTrf: FICdtTrfMsg{
			GrpHdr: Pacs009GrpHdr{
				MsgId:   msgID,
				CreDtTm: now,
				NbOfTxs: fmt.Sprintf("%d", len(txns)),
				SttlmInf: SttlmInf{SttlmMtd: "CLRG"},
			},
			CdtTrfTx: txns,
		},
	}

	xmlBytes, err := xml.MarshalIndent(doc, "", "  ")
	if err != nil {
		return nil, "", fmt.Errorf("pacs009 marshal: %w", err)
	}
	return append([]byte(xml.Header), xmlBytes...), msgID, nil
}

// ─── BuildMT202 constructs a SWIFT MT202 message (legacy RTGS fallback) ──────
// MT202 is used by older CBN RTGS systems that do not yet support ISO 20022.

func BuildMT202(
	senderBIC string,
	receiverBIC string,
	transactionRef string,
	relatedRef string,
	valueDate time.Time,
	currency string,
	amountKobo int64,
	orderingInstitutionBIC string,
	beneficiaryInstitutionBIC string,
	details string,
) string {
	amount := fmt.Sprintf("%s%.2f", currency, float64(amountKobo)/100.0)
	vd := valueDate.Format("060102") // YYMMDD
	return fmt.Sprintf(
		"{1:F01%sXXXX0000000000}{2:I202%sXXXXN}{4:\n"+
			":20:%s\n"+
			":21:%s\n"+
			":32A:%s%s\n"+
			":52A:%s\n"+
			":58A:%s\n"+
			":72:/BNF/%s\n"+
			"-}",
		senderBIC, receiverBIC,
		transactionRef,
		relatedRef,
		vd, amount,
		orderingInstitutionBIC,
		beneficiaryInstitutionBIC,
		details,
	)
}

func abs64(x int64) int64 {
	if x < 0 {
		return -x
	}
	return x
}
