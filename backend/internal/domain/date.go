package domain

import (
	"fmt"
	"strings"
	"time"
)

type Date struct {
	time.Time
}

func (d Date) MarshalJSON() ([]byte, error) {
	return []byte(`"` + d.Format(time.DateOnly) + `"`), nil
}

func (d *Date) UnmarshalJSON(data []byte) error {
	s := strings.Trim(string(data), `"`)
	formats := []string{time.DateOnly, time.DateTime, time.RFC3339}
	var pt *time.Time
	for _, f := range formats {
		t, err := time.Parse(f, s)
		if err != nil {
			continue
		}

		pt = &t
	}

	if pt == nil {
		return fmt.Errorf("error while parsing date, invalid format: %s", s)
	}

	d.Time = time.Date(pt.Year(), pt.Month(), pt.Day(), 0, 0, 0, 0, time.UTC)

	return nil
}
