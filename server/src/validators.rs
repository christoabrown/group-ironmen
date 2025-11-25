use crate::error::ApiError;
use lazy_static::lazy_static;
use regex::Regex;

#[cfg(test)]
mod valid_name_tests {
    use super::*;

    #[test]
    fn valid_names() {
        let valid_names = [
            "test",
            "with space",
            "with 1234",
            "123",
            "with-dash",
            "dash-and space",
            "CAPITAL LETTERS",
            "MiXeD case-123",
            "0123456789",
            "underscore_name",
            " space",
            "space ",
        ];

        for name in valid_names {
            assert!(valid_name(name), "{} should have been a valid name", name);
        }
    }

    #[test]
    fn invalid_names() {
        let invalid_names = [
            "@SHARED",
            "invalid!",
            "@",
            "-=+[];'./,<>?\"\\|`~",
            "=",
            "+",
            "[",
            "]",
            ";",
            "'",
            ".",
            "/",
            ",",
            "<",
            ">",
            "?",
            "\"",
            "\\",
            "|",
            "`",
            "~",
            "",
            " ",
            "                 ",
        ];

        for name in invalid_names {
            assert!(
                !valid_name(name),
                "{} should have been an invalid name",
                name
            );
        }
    }
}

pub fn valid_name(name: &str) -> bool {
    lazy_static! {
        static ref NAME_RE: Regex = Regex::new("[^A-Za-z 0-9-_]").unwrap();
    }

    let len = name.len();
    (1..=16).contains(&len) && name.is_ascii() && !NAME_RE.is_match(name) && name.trim().len() > 0
}

pub fn validate_member_prop_length<T>(
    prop_name: &str,
    value: &Option<Vec<T>>,
    min: usize,
    max: usize,
) -> Result<(), ApiError> {
    match value {
        None => Ok(()),
        Some(x) => {
            if (min..=max).contains(&x.len()) {
                Ok(())
            } else {
                Err(ApiError::GroupMemberValidationError(format!(
                    "{} length violated range constraint {}..={} actual={}",
                    prop_name,
                    min,
                    max,
                    x.len()
                )))
            }
        }
    }
}
